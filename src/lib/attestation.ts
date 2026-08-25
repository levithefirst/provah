import { ec, hash } from "starknet";
import { PROVA_ATTESTER_PRIVATE_KEY, PROVA_ATTESTER_PUBLIC_KEY } from "./config";

/**
 * Prova's server-side predicate attester.
 *
 * This is the documented v1 trust boundary (see README "What is private /
 * what is not"): until a hosted or self-run STRK20 transaction-prover is
 * wired in, the "held >= X of asset Y for >= N days" predicate is checked
 * here, against a viewing key the user supplies for the duration of the
 * request only (never persisted), rather than inside a client-side ZK
 * circuit. What's still trustless: the resulting capability is bound to a
 * single-use nullifier and verified/consumed on-chain by the ProvaPass
 * contract — nobody, including Prova, can replay it or link the claim
 * transaction back to the wallet that satisfied the predicate.
 */
export function pedersen(a: bigint, b: bigint): bigint {
  return BigInt(hash.computePedersenHash(a, b));
}

export function attestationMessageHash(
  campaignId: bigint,
  nullifier: bigint,
  recipient: bigint
): bigint {
  const inner = pedersen(campaignId, nullifier);
  return pedersen(inner, recipient);
}

export function signAttestation(
  campaignId: bigint,
  nullifier: bigint,
  recipient: bigint
): { r: string; s: string } {
  if (!PROVA_ATTESTER_PRIVATE_KEY) {
    throw new Error("PROVA_ATTESTER_PRIVATE_KEY not configured");
  }
  const msgHash = attestationMessageHash(campaignId, nullifier, recipient);
  const sig = ec.starkCurve.sign(msgHash.toString(16).padStart(64, "0"), PROVA_ATTESTER_PRIVATE_KEY);
  return { r: "0x" + sig.r.toString(16), s: "0x" + sig.s.toString(16) };
}

export function attesterPublicKey(): string {
  if (PROVA_ATTESTER_PUBLIC_KEY) return PROVA_ATTESTER_PUBLIC_KEY;
  if (!PROVA_ATTESTER_PRIVATE_KEY) throw new Error("attester key not configured");
  return ec.starkCurve.getStarkKey(PROVA_ATTESTER_PRIVATE_KEY);
}

/** Deterministic per-claim nullifier: unique per (campaign, viewing key, predicate). */
export function deriveNullifier(campaignId: bigint, viewingKey: bigint, salt: bigint): bigint {
  return pedersen(pedersen(campaignId, viewingKey), salt);
}
