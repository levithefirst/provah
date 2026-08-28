#!/usr/bin/env -S npx tsx
/**
 * Regression test for verifyPassOwnership's counterfactual-account fallback
 * (src/lib/passChallenge.ts).
 *
 * Locks in the bug that shipped once: a genuinely fresh Starknet wallet
 * (Starknet accounts are counterfactual until their first transaction) has
 * no deployed contract for provider.verifyMessageInStarknet's on-chain
 * is_valid_signature call to reach — so /api/pass's ownership check failed
 * for every brand-new wallet, which is exactly the wallet the Capability
 * Smoke Test campaign advertises ("any wallet qualifies, including a
 * brand-new, empty one"). This also locks in a subtler bug caught while
 * building the fix: passing an account's bare x-only public key felt
 * straight to starknet.js's off-chain verify() always returns false, even
 * for the correct key — verify needs the full curve point, so the fallback
 * must reconstruct both possible y-parities (0x02/0x03 prefixes) from the
 * stored x-only felt and accept either.
 *
 * Uses only starknet.js and the real, shared verifyPassOwnership() — no
 * wallet, no database, no live RPC (the on-chain path is exercised with a
 * fake provider that always throws the RPC's real "Contract not found"
 * shape, forcing the fallback path under test). Run with:
 * npm run test:ownership-fallback
 */
import assert from "node:assert/strict";
import { ec, hash } from "starknet";
import { verifyPassOwnership, type PassDeploymentData } from "../src/lib/passChallenge";
import type { RpcProvider } from "starknet";

const CAMPAIGN_ID = "0x2df11a90c5a246beb0c7b59cc13e3d73e3c7ae1de5a00f9d71bee9fb2720582";
// Real Starknet RPC error shape for calling a method on an address with no
// deployed contract (JSON-RPC error code 20) — see starknet.js's RpcError
// formatting (`${code}: ${message}: ...`).
const CONTRACT_NOT_FOUND_ERROR = new Error("20: Contract not found: {}");

function undeployedProvider(): RpcProvider {
  return {
    verifyMessageInStarknet: async () => {
      throw CONTRACT_NOT_FOUND_ERROR;
    },
  } as unknown as RpcProvider;
}

let failures = 0;

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok — ${label}`))
    .catch((err) => {
      failures += 1;
      console.error(`  FAIL — ${label}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    });
}

async function main() {
  // A counterfactual OpenZeppelin-style account: constructor([public_key]),
  // salt = public_key (the common wallet convention).
  const ownerPrivateKey = "0x1234567890abcdef";
  const ownerPublicKey = ec.starkCurve.getStarkKey(ownerPrivateKey); // x-only felt, as stored on-chain
  const classHash = "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b7";
  const salt = ownerPublicKey;
  const calldata = [ownerPublicKey];
  const address = hash.calculateContractAddressFromHash(salt, classHash, calldata, 0);

  const deploymentData: PassDeploymentData = { classHash, salt, calldata };

  // Sign the real IssuePass typed-data challenge with the account's real key.
  const { issuePassTypedData } = await import("../src/lib/passChallenge");
  const { typedData: starknetTypedData } = await import("starknet");
  const message = issuePassTypedData(CAMPAIGN_ID);
  const msgHash = starknetTypedData.getMessageHash(message, address);
  const sig = ec.starkCurve.sign(BigInt(msgHash).toString(16).padStart(64, "0"), ownerPrivateKey);
  const signature = [sig.r.toString(), sig.s.toString()];

  console.log("Positive: counterfactual account, real signature, real deploymentData");
  await check("verifyPassOwnership accepts it", async () => {
    const ok = await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, deploymentData);
    assert.equal(ok, true);
  });

  console.log("\nNegative: no deploymentData supplied at all");
  await check("verifyPassOwnership rejects (rethrows the original RPC error)", async () => {
    await assert.rejects(() => verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, null));
  });

  console.log("\nNegative: forged deploymentData claiming someone else's address");
  await check("verifyPassOwnership rejects a deploymentData/address mismatch", async () => {
    const attackerPrivateKey = "0xdeadbeef";
    const attackerPublicKey = ec.starkCurve.getStarkKey(attackerPrivateKey);
    const forgedDeploymentData: PassDeploymentData = {
      classHash,
      salt: attackerPublicKey,
      calldata: [attackerPublicKey],
    };
    // Attacker signs with their own key but claims the victim's address —
    // this must never verify, on-chain path or fallback.
    await assert.rejects(() =>
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, forgedDeploymentData)
    );
  });

  console.log("\nNegative: valid deploymentData/address, but a signature from the wrong key");
  await check("verifyPassOwnership returns false, does not throw", async () => {
    const wrongPrivateKey = "0xfeedface";
    const wrongSig = ec.starkCurve.sign(BigInt(msgHash).toString(16).padStart(64, "0"), wrongPrivateKey);
    const wrongSignature = [wrongSig.r.toString(), wrongSig.s.toString()];
    const ok = await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, wrongSignature, deploymentData);
    assert.equal(ok, false);
  });

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("All ownership-fallback checks passed.");
}

main();
