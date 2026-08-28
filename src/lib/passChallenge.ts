import { hash, num, typedData as starknetTypedData, type TypedData } from "starknet";
import type { RpcProvider } from "starknet";

const STARKNET_CHAIN_ID = "0x534e5f4d41494e";

export function issuePassTypedData(campaignId: string): TypedData {
  return {
    types: {
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

export type PassDeploymentData = {
  classHash: string;
  salt: string;
  calldata: string[];
};

function firstFelt(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v === undefined || v === null || v === "") continue;
    try {
      return num.toHex(v as string);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The wallet-api spec (@starknet-io/types-js) uses snake_case
 * (class_hash), but wallets have been observed returning camelCase
 * (classHash) or naming constructor calldata differently
 * (constructorCalldata / constructor_calldata) depending on their adapter
 * layer. Reading only the spec's exact field name means a wallet using a
 * different convention silently produces undefined fields — which
 * JSON.stringify then drops from the POST body entirely, turning into a
 * deploy_commit failure on the server that has nothing to do with the
 * account itself. Accepts either convention; returns null (not a partial,
 * partially-undefined object) if none of them yield a complete triple.
 */
export function normalizePassDeploymentData(raw: unknown): PassDeploymentData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const classHash = firstFelt(o.classHash, o.class_hash);
  const salt = firstFelt(o.salt, o.addressSalt, o.address_salt);
  const rawCalldata = o.calldata ?? o.constructorCalldata ?? o.constructor_calldata;
  if (!classHash || !salt || !Array.isArray(rawCalldata)) return null;
  try {
    return { classHash, salt, calldata: rawCalldata.map((v) => num.toHex(v as string)) };
  } catch {
    return null;
  }
}

export type OwnershipFailureStage =
  | "typed_data"
  | "signature_shape"
  | "rpc"
  | "onchain"
  | "missing_deployment_data"
  | "deploy_commit"
  | "offchain";

export class OwnershipVerificationError extends Error {
  readonly stage: OwnershipFailureStage;
  constructor(stage: OwnershipFailureStage, detail: string) {
    super(detail);
    this.name = "OwnershipVerificationError";
    this.stage = stage;
  }
}

function tryVerifyAgainstCandidateFelt(
  message: TypedData,
  signature: string[],
  candidateFelt: string,
  accountAddress: string
): boolean {
  try {
    const xHex = num.toHex(candidateFelt).slice(2).padStart(64, "0");
    for (const parityPrefix of ["0x02", "0x03"]) {
      try {
        if (starknetTypedData.verifyMessage(message, signature, parityPrefix + xHex, accountAddress)) {
          return true;
        }
      } catch {
        // Not a valid curve point at this parity. Try the other one.
      }
    }
  } catch {
    // The candidate was not a valid felt. The caller reports the aggregate
    // off-chain failure rather than turning malformed calldata into a 500.
  }
  return false;
}

const RPC_CONTRACT_NOT_FOUND = 20;

// starknet.js's own RpcError exposes the JSON-RPC error code as a top-level
// `.code` getter (confirmed by reading its source), but this checks a
// couple of plausible nested shapes too (`.error.code`, `.baseError.code`,
// `.data.code`) as cheap defense-in-depth in case some other layer (a
// proxy, an older/alternate provider) wraps it differently.
function rpcErrorCode(err: unknown): number | undefined {
  const e = err as
    | { code?: number | string; error?: { code?: number | string }; baseError?: { code?: number | string }; data?: { code?: number | string } }
    | null;
  const raw = e?.code ?? e?.error?.code ?? e?.baseError?.code ?? e?.data?.code;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return undefined;
}

function looksUndeployed(err: unknown): boolean {
  if (rpcErrorCode(err) === RPC_CONTRACT_NOT_FOUND) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /contract not found|is not deployed|uninitialized contract|class hash not found/i.test(msg);
}

async function isAccountDeployed(provider: RpcProvider, address: string): Promise<boolean> {
  try {
    const classHash = await provider.getClassHashAt(address);
    // Some RPC adapters have historically returned a zero class hash instead
    // of throwing for an uninitialized address. Treat that as undeployed,
    // while preserving a hard RPC failure for everything else.
    if (classHash && BigInt(classHash) === BigInt(0)) return false;
    return true;
  } catch (err) {
    if (looksUndeployed(err)) return false;
    const msg = err instanceof Error ? err.message : String(err);
    throw new OwnershipVerificationError(
      "rpc",
      `could not determine whether ${address} is deployed: ${msg}`
    );
  }
}

/**
 * Account-abstraction wallets (Ready, Argent, Braavos) often wrap the real
 * owner [r, s] pair inside a longer array — e.g. a guardian-enabled account
 * can return [num_signers, type, pubkey, r, s, guardian_type,
 * guardian_pubkey, guardian_r, guardian_s], putting the owner's real pair
 * in the MIDDLE of the array, not at either end. Trying only the first-two
 * and last-two slices (the previous version of this function) misses that
 * case entirely. This tries every consecutive pair instead — still no
 * weaker a check than before: each candidate still has to pass real ECDSA
 * verification (on-chain is_valid_signature, or the off-chain check
 * against deploymentData) to be accepted, this just widens which slice of
 * the array gets a chance to be tried.
 */
function candidateSignaturePairs(signature: unknown): string[][] {
  try {
    if (Array.isArray(signature)) {
      if (signature.length < 2) {
        throw new OwnershipVerificationError(
          "signature_shape",
          `wallet returned a ${signature.length}-element signature array, too short to contain [r, s]`
        );
      }
      const hexed = signature.map((v) => num.toHex(v as string));
      if (hexed.length === 2) return [hexed];
      const candidates: string[][] = [];
      const seen = new Set<string>();
      for (let i = 0; i <= hexed.length - 2; i++) {
        const pair = [hexed[i], hexed[i + 1]];
        const key = `${pair[0]}|${pair[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(pair);
      }
      return candidates;
    }
    if (signature && typeof signature === "object" && "r" in signature && "s" in signature) {
      const { r, s } = signature as { r: string; s: string };
      return [[num.toHex(r), num.toHex(s)]];
    }
  } catch (err) {
    if (err instanceof OwnershipVerificationError) throw err;
    throw new OwnershipVerificationError(
      "signature_shape",
      `wallet returned invalid signature felts: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  throw new OwnershipVerificationError("signature_shape", "wallet returned a signature in an unrecognized shape");
}

export async function verifyPassOwnership(
  provider: RpcProvider,
  campaignId: string,
  proverAddress: string,
  signatureInput: unknown,
  deploymentData?: PassDeploymentData | null
): Promise<void> {
  const message = issuePassTypedData(campaignId);

  try {
    starknetTypedData.getMessageHash(message, proverAddress);
  } catch (err) {
    throw new OwnershipVerificationError(
      "typed_data",
      `typed data failed to hash: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const signatureCandidates = candidateSignaturePairs(signatureInput);
  const deployed = await isAccountDeployed(provider, proverAddress);
  // Loud on purpose: everything logged here is already public (an address,
  // a boolean, array lengths) — this is what turns a production "Generate
  // is broken" report into a two-minute log read instead of a guessing
  // game, without needing direct DB/RPC access to reproduce.
  console.log("[verifyPassOwnership]", {
    proverAddress,
    deployed,
    signatureCandidateCount: signatureCandidates.length,
    hasDeploymentData: !!deploymentData,
    deploymentDataCalldataLength: deploymentData?.calldata?.length ?? null,
  });

  if (deployed) {
    // A deployed multi-signer account (Braavos/Argent with a guardian) can
    // require its is_valid_signature entrypoint to see the FULL wallet
    // array (e.g. [num_signers, type, pubkey, r, s, guardian_type, ...]),
    // not just a 2-element [r, s] slice — the contract itself decides how
    // to parse it. Try the full array first, then every 2-element slice.
    const onchainCandidates: string[][] = [];
    if (Array.isArray(signatureInput) && signatureInput.length > 2) {
      onchainCandidates.push(signatureInput.map((v) => num.toHex(v as string)));
    }
    onchainCandidates.push(...signatureCandidates);

    let rpcError: unknown;
    for (const candidate of onchainCandidates) {
      try {
        if (await provider.verifyMessageInStarknet(message, candidate, proverAddress)) return;
      } catch (err) {
        rpcError = err;
      }
    }
    if (rpcError) {
      throw new OwnershipVerificationError(
        "onchain",
        `is_valid_signature call failed: ${rpcError instanceof Error ? rpcError.message : String(rpcError)}`
      );
    }
    throw new OwnershipVerificationError("onchain", "signature does not match this account's registered key");
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
    console.error("[verifyPassOwnership] deploy_commit mismatch", {
      proverAddress,
      computedAddress,
      classHash: deploymentData.classHash,
      salt: deploymentData.salt,
      calldataLength: deploymentData.calldata.length,
    });
    throw new OwnershipVerificationError(
      "deploy_commit",
      `deploymentData does not hash to the claiming address (computed ${computedAddress}, claimed ${proverAddress})`
    );
  }

  for (const candidateFelt of deploymentData.calldata) {
    for (const candidateSignature of signatureCandidates) {
      if (tryVerifyAgainstCandidateFelt(message, candidateSignature, candidateFelt, proverAddress)) {
        return;
      }
    }
  }
  console.error("[verifyPassOwnership] offchain verification exhausted every candidate", {
    proverAddress,
    calldataLength: deploymentData.calldata.length,
    signatureCandidateCount: signatureCandidates.length,
  });
  throw new OwnershipVerificationError(
    "offchain",
    "signature did not verify against any public key found in the account's constructor calldata"
  );
}
