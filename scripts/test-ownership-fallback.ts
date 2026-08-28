#!/usr/bin/env -S npx tsx
/**
 * Regression test for verifyPassOwnership (src/lib/passChallenge.ts) — both
 * the deployed (on-chain) and undeployed (off-chain deploymentData
 * fallback) verification paths, and every distinct failure stage.
 *
 * Locks in two bugs that shipped:
 *  1. A genuinely fresh Starknet wallet (accounts are counterfactual until
 *     their first transaction) has no deployed contract for the on-chain
 *     is_valid_signature call to reach — so /api/pass's ownership check
 *     failed for every brand-new wallet, exactly the wallet the Capability
 *     Smoke Test campaign advertises ("any wallet qualifies, including a
 *     brand-new, empty one").
 *  2. Passing an account's bare x-only public key felt straight to
 *     starknet.js's off-chain verify() always returns false, even for the
 *     correct key — verify needs the full curve point, so the fallback
 *     must reconstruct both possible y-parities (0x02/0x03 prefixes).
 *
 * Also covers the P0 hardening pass: deployment status is now determined
 * explicitly (via getClassHashAt / RPC error code 20) rather than inferred
 * from whatever verifyMessageInStarknet happens to throw, and every
 * failure is tagged with a specific stage instead of one generic 401 — see
 * OwnershipFailureStage in passChallenge.ts.
 *
 * Uses only starknet.js and the real, shared verifyPassOwnership() — no
 * wallet, no database, no live RPC (fake providers below reproduce the
 * exact RPC error shapes real nodes return). Run with:
 * npm run test:ownership-fallback
 */
import assert from "node:assert/strict";
import { ec, hash, typedData as starknetTypedData } from "starknet";
import type { RpcProvider } from "starknet";
import { issuePassTypedData, verifyPassOwnership, OwnershipVerificationError, type PassDeploymentData } from "../src/lib/passChallenge";

const CAMPAIGN_ID = "0x2df11a90c5a246beb0c7b59cc13e3d73e3c7ae1de5a00f9d71bee9fb2720582";

// Real Starknet RPC error shape for calling a method on an address with no
// deployed contract: JSON-RPC error code 20 ("Contract not found"), which
// starknet.js's RpcError exposes as a numeric `.code` getter — this is what
// isAccountDeployed actually branches on now, not the message text.
class FakeContractNotFoundError extends Error {
  code = 20;
  constructor() {
    super("20: Contract not found: {}");
  }
}

function undeployedProvider(): RpcProvider {
  return {
    getClassHashAt: async () => {
      throw new FakeContractNotFoundError();
    },
    verifyMessageInStarknet: async () => {
      throw new Error("should never be called once the account is known to be undeployed");
    },
  } as unknown as RpcProvider;
}

function deployedProvider(expectedResult: boolean): RpcProvider {
  return {
    getClassHashAt: async () => "0xdeadbeef",
    verifyMessageInStarknet: async () => expectedResult,
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

async function assertRejectsWithStage(promise: Promise<unknown>, expectedStage: string) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof OwnershipVerificationError, `expected an OwnershipVerificationError, got ${err}`);
    assert.equal((err as OwnershipVerificationError).stage, expectedStage);
    return;
  }
  assert.fail("expected verifyPassOwnership to reject, but it resolved");
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

  const message = issuePassTypedData(CAMPAIGN_ID);
  const msgHash = starknetTypedData.getMessageHash(message, address);
  const sig = ec.starkCurve.sign(BigInt(msgHash).toString(16).padStart(64, "0"), ownerPrivateKey);
  const signature = [sig.r.toString(), sig.s.toString()];

  console.log("Deployed-account path (on-chain is_valid_signature)");
  await check("accepts a valid signature", async () => {
    await verifyPassOwnership(deployedProvider(true), CAMPAIGN_ID, address, signature, null);
  });
  await check("rejects with stage 'onchain' when is_valid_signature says no", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(deployedProvider(false), CAMPAIGN_ID, address, signature, null),
      "onchain"
    );
  });

  console.log("\nUndeployed-account path: positive");
  await check("counterfactual account, real signature, real deploymentData -> accepts", async () => {
    await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, deploymentData);
  });

  console.log("\nUndeployed-account path: every failure stage");
  await check("no deploymentData at all -> stage 'missing_deployment_data'", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, null),
      "missing_deployment_data"
    );
  });
  await check("forged deploymentData claiming someone else's address -> stage 'deploy_commit'", async () => {
    const attackerPrivateKey = "0xdeadbeef";
    const attackerPublicKey = ec.starkCurve.getStarkKey(attackerPrivateKey);
    const forgedDeploymentData: PassDeploymentData = {
      classHash,
      salt: attackerPublicKey,
      calldata: [attackerPublicKey],
    };
    // Attacker signs with their own key but claims the victim's address —
    // this must never verify, on-chain path or fallback.
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, forgedDeploymentData),
      "deploy_commit"
    );
  });
  await check("valid deploymentData/address, but a signature from the wrong key -> stage 'offchain'", async () => {
    const wrongPrivateKey = "0xfeedface";
    const wrongSig = ec.starkCurve.sign(BigInt(msgHash).toString(16).padStart(64, "0"), wrongPrivateKey);
    const wrongSignature = [wrongSig.r.toString(), wrongSig.s.toString()];
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, wrongSignature, deploymentData),
      "offchain"
    );
  });

  console.log("\nSignature shape normalization");
  await check("an {r, s} object (some wallets return this instead of an array) is accepted", async () => {
    await verifyPassOwnership(
      undeployedProvider(),
      CAMPAIGN_ID,
      address,
      { r: signature[0], s: signature[1] },
      deploymentData
    );
  });
  await check("a 3+ element array is rejected with stage 'signature_shape', not silently truncated", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, [...signature, "0x1"], deploymentData),
      "signature_shape"
    );
  });
  await check("a single-element array is rejected with stage 'signature_shape'", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, [signature[0]], deploymentData),
      "signature_shape"
    );
  });

  console.log("\nRPC failure while determining deployment status");
  await check("an RPC error unrelated to 'contract not found' -> stage 'rpc', never silently treated as undeployed", async () => {
    const floodedProvider = {
      getClassHashAt: async () => {
        throw new Error("timeout contacting RPC node");
      },
    } as unknown as RpcProvider;
    await assertRejectsWithStage(
      verifyPassOwnership(floodedProvider, CAMPAIGN_ID, address, signature, deploymentData),
      "rpc"
    );
  });

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("All ownership-fallback checks passed.");
}

main();
