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
 * from whatever verifyMessageInStarknet happens to throw, every failure is
 * tagged with a specific stage instead of one generic 401 (see
 * OwnershipFailureStage in passChallenge.ts), and a signature array with
 * more than 2 elements (some wallets prepend a version byte, append
 * guardian/session-key data, or bury the real [r, s] pair in the middle
 * for a multi-signer account) is tried as EVERY consecutive pair — not
 * just first-two/last-two — rather than rejected outright. The deployed
 * (on-chain) path also tries the full original array as its own candidate
 * first, since a multi-signer account's is_valid_signature can require
 * seeing the complete wallet array rather than a bare [r, s] slice. Every
 * candidate still has to pass real verification to be accepted.
 *
 * Uses only starknet.js and the real, shared verifyPassOwnership() — no
 * wallet, no database, no live RPC (fake providers below reproduce the
 * exact RPC error shapes real nodes return). Run with:
 * npm run test:ownership-fallback
 */
import assert from "node:assert/strict";
import { ec, hash, typedData as starknetTypedData } from "starknet";
import type { RpcProvider } from "starknet";
import {
  issuePassTypedData,
  verifyPassOwnership,
  normalizePassDeploymentData,
  OwnershipVerificationError,
  type PassDeploymentData,
} from "../src/lib/passChallenge";

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

  console.log("\nDeployed-account path: full wallet array as a candidate");
  await check("a deployed multi-signer account gets the FULL signature array, not just a 2-element slice", async () => {
    const seen: unknown[] = [];
    const multiSignerProvider = {
      getClassHashAt: async () => "0xabc",
      verifyMessageInStarknet: async (_msg: unknown, sig: unknown) => {
        seen.push(sig);
        // Only accepts the exact full 4-element array — a 2-element slice
        // must never satisfy this on its own.
        return Array.isArray(sig) && sig.length === 4;
      },
    } as unknown as RpcProvider;
    await verifyPassOwnership(multiSignerProvider, CAMPAIGN_ID, address, ["0x1", ...signature, "0x9"], null);
    assert.ok(seen.some((s) => Array.isArray(s) && s.length === 4), "expected the full 4-element array to be tried");
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
  await check("a 3-element array with the real [r, s] as the LAST two elements still verifies", async () => {
    // Some wallets prepend a version/scheme byte ahead of the real pair.
    await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, ["0x1", ...signature], deploymentData);
  });
  await check("a 3-element array with the real [r, s] as the FIRST two elements still verifies", async () => {
    // Others append guardian/session-key data after the owner's real pair.
    await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, [...signature, "0x1"], deploymentData);
  });
  await check("a 3-element array where NEITHER slicing is a real signature -> stage 'offchain', not silently accepted", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, ["0x1", "0x2", "0x3"], deploymentData),
      "offchain"
    );
  });
  await check("a 5-element array with the real [r, s] BURIED IN THE MIDDLE still verifies", async () => {
    // Mirrors a guardian-enabled account-abstraction signature shape, e.g.
    // [num_signers, type, pubkey, r, s] — the owner's real pair sits at
    // indices 2,3 here, which is neither the first-two nor the last-two
    // slice. Only trying every consecutive pair catches this.
    await verifyPassOwnership(
      undeployedProvider(),
      CAMPAIGN_ID,
      address,
      ["0x1", "0x2", ...signature, "0x9"],
      deploymentData
    );
  });
  await check("a single-element array is rejected with stage 'signature_shape' (too short to contain [r, s])", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, [signature[0]], deploymentData),
      "signature_shape"
    );
  });
  await check("an empty array is rejected with stage 'signature_shape'", async () => {
    await assertRejectsWithStage(
      verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, [], deploymentData),
      "signature_shape"
    );
  });

  console.log("\ndeploymentData field-name normalization");
  await check("camelCase deploymentData (classHash/constructorCalldata) normalizes and verifies", async () => {
    const raw = { classHash, salt, constructorCalldata: calldata };
    const normalized = normalizePassDeploymentData(raw);
    assert.ok(normalized);
    assert.equal(BigInt(normalized.classHash), BigInt(classHash));
    assert.equal(BigInt(normalized.salt), BigInt(salt));
    assert.deepEqual(normalized.calldata, calldata);
    await verifyPassOwnership(undeployedProvider(), CAMPAIGN_ID, address, signature, normalized);
  });
  await check("snake_case deploymentData (class_hash/constructor_calldata) normalizes and verifies", async () => {
    const raw = { class_hash: classHash, salt, constructor_calldata: calldata };
    const normalized = normalizePassDeploymentData(raw);
    assert.ok(normalized);
    assert.equal(BigInt(normalized.classHash), BigInt(classHash));
  });
  await check("deploymentData missing calldata entirely normalizes to null, not a partial object", () => {
    assert.equal(normalizePassDeploymentData({ classHash, salt }), null);
  });
  await check("a non-object (e.g. undefined) normalizes to null", () => {
    assert.equal(normalizePassDeploymentData(undefined), null);
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
