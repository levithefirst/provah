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

/**
 * Verifies proverAddress actually controls the signature over
 * issuePassTypedData(campaignId) — the SNIP-12 ownership proof /api/pass
 * requires before it will read anyone's deposit history.
 *
 * Prefers the normal path: ask the chain to run is_valid_signature on the
 * account contract at proverAddress (provider.verifyMessageInStarknet).
 * Starknet accounts are counterfactual until their first transaction,
 * though — and the Capability Smoke Test campaign explicitly promises "any
 * wallet qualifies, including a brand-new, empty one." A wallet that has
 * genuinely never transacted has no deployed contract for that RPC call to
 * reach, so without this fallback every truly fresh wallet — exactly the
 * case the smoke test advertises — would fail here before eligibility is
 * ever checked. When the on-chain call fails specifically because there's
 * no contract at that address yet, and the caller supplied deploymentData,
 * this verifies the identical signature off-chain instead: first confirming
 * that data really does hash to proverAddress (so nobody can substitute a
 * public key they control for one they don't), then checking the signature
 * cryptographically against every felt in that constructor calldata —
 * exactly one of which is the account's real public key for every standard
 * single-owner account class (OpenZeppelin, ArgentX, Braavos). This is not
 * a weaker check than the on-chain path: it's the same ECDSA verification
 * is_valid_signature would perform, against a wallet that simply has no
 * deployed contract yet to call it on.
 *
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

export async function verifyPassOwnership(
  provider: RpcProvider,
  campaignId: string,
  proverAddress: string,
  signature: string[],
  deploymentData?: PassDeploymentData | null
): Promise<boolean> {
  const message = issuePassTypedData(campaignId);
  try {
    return await provider.verifyMessageInStarknet(message, signature, proverAddress);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const looksUndeployed = /contract not found|not deployed|uninitialized contract/i.test(msg);
    if (!looksUndeployed || !deploymentData) throw err;

    let computedAddress: string;
    try {
      computedAddress = hash.calculateContractAddressFromHash(
        deploymentData.salt,
        deploymentData.classHash,
        deploymentData.calldata,
        0
      );
    } catch {
      throw err;
    }
    if (BigInt(computedAddress) !== BigInt(proverAddress)) throw err;

    for (const candidate of deploymentData.calldata) {
      if (BigInt(candidate) === BigInt(0)) continue;
      if (tryVerifyAgainstCandidateFelt(message, signature, candidate, proverAddress)) {
        return true;
      }
    }
    return false;
  }
}
