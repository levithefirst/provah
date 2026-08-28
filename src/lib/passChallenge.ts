import type { TypedData } from "starknet";

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
