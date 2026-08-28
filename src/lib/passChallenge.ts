import { hash, num, typedData as starknetTypedData, type TypedData } from "starknet";
import type { RpcProvider } from "starknet";

// SNIP-12 revision 1: domain type MUST be StarknetDomain and MUST include
// revision: "1" on both types.StarknetDomain and domain.revision.
// Missing revision → starknet.js validateTypedData throws → was swallowed as 403 on /api/pass.

// Public, non-secret — safe to import from client and server alike (unlike
// attestation.ts, which also holds the attester's private key path).
const STARKNET_CHAIN_ID = "0x534e5f4d41494e";

/**
 * SNIP-12 typed data for "prove you control this address before Prova checks
 * its public deposit history and issues a pass for it." Shared verbatim
 * between client (signs it via wallet_signTypedData) and server (recomputes
 * the identical hash and checks it against the address's is_valid_signature)
 * — see /api/pass and ProvaApp.tsx's handleGeneratePass. Binding campaignId
 * into the message means a signature for one campaign can't be replayed to
 * mint a pass in a different one.
 */
export function issuePassTypedData(campaignId: string): TypedData {
  return {
    types: {
      // SNIP-12 revision 1: the domain type must be named "StarknetDomain"
      // (not "StarkNetDomain") AND carry a "revision" field, with a matching
      // domain.revision value below — starknet.js's own identifyRevision()
      // silently fails validation (and every wallet_signTypedData /
      // verifyMessageInStarknet call with it) if either half is missing,
      // which is exactly what broke pass generation before this fix.
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      IssuePass: [{ name: "campaign_id", type: "felt" }],
    },
    primaryType: "IssuePass",
    domain: { name: "Provah", version: "1", chainId: STARKNET_CHAIN_ID, revision: "1" },
    message: { campaign_id: campaignId },
  };
}

// The wallet's own wallet_deploymentData response (salt, class hash,
// constructor calldata) — present only for a counterfactual (not-yet-
// deployed) account. See verifyPassOwnership below for why /api/pass needs
// this at all.
export type PassDeploymentData = {
  classHash: string;
  salt: string;
  calldata: string[];
};

// Every distinct way ownership verification can fail to prove control of an
// address — deliberately granular so /api/pass can log and return exactly
// which step broke, instead of one opaque "invalid_ownership_signature" for
// everything. See STATUS.md "Pre-demo QA" / the Generate-pass P0 fix for
// why this matters: a generic catch-all here is what let the undeployed-
// wallet bug hide behind the same error as a genuinely bad signature.
export type OwnershipFailureStage =
  | "typed_data" // the SNIP-12 payload itself doesn't hash (shouldn't happen — issuePassTypedData is fixed and tested — but never assume)
  | "signature_shape" // the wallet returned a signature array this code doesn't know how to interpret
  | "rpc" // couldn't even determine whether the account is deployed (RPC down, wrong network, etc.)
  | "onchain" // account IS deployed, but is_valid_signature rejected this signature
  | "missing_deployment_data" // account is NOT deployed and the wallet didn't supply wallet_deploymentData
  | "deploy_commit" // deploymentData was supplied but doesn't hash to the address that's claiming it
  | "offchain"; // account is NOT deployed, deploymentData checks out, but no candidate key in it validates this signature

export class OwnershipVerificationError extends Error {
  readonly stage: OwnershipFailureStage;
  constructor(stage: OwnershipFailureStage, detail: string) {
    super(detail);
    this.name = "OwnershipVerificationError";
    this.stage = stage;
  }
}

/**
 * One wrinkle: account contracts (and their constructor calldata) store
 * only the x-coordinate of the public key, but starknet.js's off-chain
 * verify needs the full curve point (x and y) to do the math — passing the
 * bare x-only felt straight through always verifies false, even for the
 * correct key (confirmed by direct testing against starknet.js). Since the
 * stored felt alone doesn't record which of the two possible y-values is
 * the real one, this reconstructs both (compressed-point prefixes 0x02 and
 * 0x03) and accepts either — exactly one is a genuine point on the curve
 * for a real key, and only a signature from its matching private key will
 * verify against it.
 */
function tryVerifyAgainstCandidateFelt(
  message: TypedData,
  signature: string[],
  candidateFelt: string,
  accountAddress: string
): boolean {
  const xHex = num.toHex(candidateFelt).slice(2).padStart(64, "0");
  for (const parityPrefix of ["0x02", "0x03"]) {
    try {
      if (starknetTypedData.verifyMessage(message, signature, parityPrefix + xHex, accountAddress)) {
        return true;
      }
    } catch {
      // Not a valid curve point at this parity — try the other one.
    }
  }
  return false;
}

// JSON-RPC error code 20 ("Contract not found") per the Starknet RPC spec —
// numeric and provider-agnostic, unlike matching on error message text
// (which varies by RPC node/client and was the previous, more fragile
// version of this check). starknet.js's RpcError exposes this as `.code`.
const RPC_CONTRACT_NOT_FOUND = 20;

async function isAccountDeployed(provider: RpcProvider, address: string): Promise<boolean> {
  try {
    await provider.getClassHashAt(address);
    return true;
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code === RPC_CONTRACT_NOT_FOUND) return false;
    // Fall back to message sniffing only for a provider that doesn't
    // surface `.code` cleanly — still not confirmed-undeployed if neither
    // matches, so this stays a hard "we don't know," not a silent "yes."
    const msg = err instanceof Error ? err.message : String(err);
    if (/contract not found|is not deployed|uninitialized contract/i.test(msg)) return false;
    throw new OwnershipVerificationError(
      "rpc",
      `could not determine whether ${address} is deployed: ${msg}`
    );
  }
}

/**
 * Normalizes a wallet's wallet_signTypedData response to the plain [r, s]
 * pair every verification path here expects. Different wallets have been
 * observed to shape this differently (a bare array, or occasionally an
 * object with r/s fields) — this accepts either without guessing at
 * anything beyond that: an array with anything other than exactly two
 * elements is a signature scheme (multisig/guardian/session-key) this
 * function doesn't know how to interpret, and is rejected with a clear
 * stage rather than silently taking the first two elements and hoping.
 */
function normalizeSignature(signature: unknown): string[] {
  if (Array.isArray(signature)) {
    if (signature.length !== 2) {
      throw new OwnershipVerificationError(
        "signature_shape",
        `wallet returned a ${signature.length}-element signature array, expected exactly 2 ([r, s]) — this account may use a multi-signer scheme not yet supported`
      );
    }
    return signature.map((v) => num.toHex(v as string));
  }
  if (signature && typeof signature === "object" && "r" in signature && "s" in signature) {
    const { r, s } = signature as { r: string; s: string };
    return [num.toHex(r), num.toHex(s)];
  }
  throw new OwnershipVerificationError("signature_shape", "wallet returned a signature in an unrecognized shape");
}

/**
 * Verifies proverAddress actually controls the signature over
 * issuePassTypedData(campaignId) — the SNIP-12 ownership proof /api/pass
 * requires before it will read anyone's deposit history. Throws
 * OwnershipVerificationError (never a bare Error) on any failure, tagged
 * with exactly which stage broke — see OwnershipFailureStage.
 *
 * Prefers the normal path: ask the chain to run is_valid_signature on the
 * account contract at proverAddress. Starknet accounts are counterfactual
 * until their first transaction, though — and the Capability Smoke Test
 * campaign explicitly promises "any wallet qualifies, including a
 * brand-new, empty one." A wallet that has genuinely never transacted has
 * no deployed contract for that RPC call to reach, so without a fallback
 * every truly fresh wallet — exactly the case the smoke test advertises —
 * would fail here before eligibility is ever checked. Deployment status is
 * checked explicitly up front (via getClassHashAt / RPC error code 20,
 * numeric and provider-agnostic) rather than inferred from whatever error
 * verifyMessageInStarknet happens to throw, since that string can vary and
 * silently misroute a legitimate failure into the wrong branch.
 *
 * For an undeployed account with deploymentData supplied, this verifies
 * the identical signature off-chain instead: first confirming that data
 * really does hash to proverAddress (so nobody can substitute a public key
 * they control for one they don't), then checking the signature
 * cryptographically against every felt in that constructor calldata —
 * exactly one of which is the account's real public key for every standard
 * single-owner account class (OpenZeppelin, ArgentX, Braavos). This is not
 * a weaker check than the on-chain path: it's the same ECDSA verification
 * is_valid_signature would perform, against a wallet that simply has no
 * deployed contract yet to call it on.
 */
export async function verifyPassOwnership(
  provider: RpcProvider,
  campaignId: string,
  proverAddress: string,
  signatureInput: unknown,
  deploymentData?: PassDeploymentData | null
): Promise<void> {
  const message = issuePassTypedData(campaignId);

  // Validated once, up front, independent of the deployed/undeployed
  // branch below — a malformed typed-data payload (there shouldn't be one;
  // issuePassTypedData is fixed and covered by test:typed-data, but never
  // assume) or a signature shape this code can't interpret should fail the
  // same way regardless of which path would otherwise run.
  try {
    starknetTypedData.getMessageHash(message, proverAddress); // validates the payload; the paths below recompute this internally
  } catch (err) {
    throw new OwnershipVerificationError(
      "typed_data",
      `typed data failed to hash: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const signature = normalizeSignature(signatureInput);

  const deployed = await isAccountDeployed(provider, proverAddress);

  if (deployed) {
    let ok: boolean;
    try {
      ok = await provider.verifyMessageInStarknet(message, signature, proverAddress);
    } catch (err) {
      throw new OwnershipVerificationError(
        "onchain",
        `is_valid_signature call failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (!ok) {
      throw new OwnershipVerificationError("onchain", "signature does not match this account's registered key");
    }
    return;
  }

  if (!deploymentData) {
    throw new OwnershipVerificationError(
      "missing_deployment_data",
      "account is not deployed and the wallet did not provide wallet_deploymentData"
    );
  }

  let computedAddress: string;
  try {
    computedAddress = hash.calculateContractAddressFromHash(
      deploymentData.salt,
      deploymentData.classHash,
      deploymentData.calldata,
      0
    );
  } catch (err) {
    throw new OwnershipVerificationError(
      "deploy_commit",
      `could not compute an address from deploymentData: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (BigInt(computedAddress) !== BigInt(proverAddress)) {
    throw new OwnershipVerificationError(
      "deploy_commit",
      "deploymentData does not hash to the address claiming it"
    );
  }

  for (const candidate of deploymentData.calldata) {
    if (BigInt(candidate) === BigInt(0)) continue;
    if (tryVerifyAgainstCandidateFelt(message, signature, candidate, proverAddress)) {
      return;
    }
  }
  throw new OwnershipVerificationError(
    "offchain",
    "signature did not verify against any public key found in the account's constructor calldata"
  );
}
