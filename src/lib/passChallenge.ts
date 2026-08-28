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

async function isAccountDeployed(provider: RpcProvider, address: string): Promise<boolean> {
  try {
    const classHash = await provider.getClassHashAt(address);
    // Some RPC adapters have historically returned a zero class hash instead
    // of throwing for an uninitialized address. Treat that as undeployed,
    // while preserving a hard RPC failure for everything else.
    if (classHash && BigInt(classHash) === BigInt(0)) return false;
    return true;
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code === RPC_CONTRACT_NOT_FOUND) return false;
    const msg = err instanceof Error ? err.message : String(err);
    if (/contract not found|is not deployed|uninitialized contract/i.test(msg)) return false;
    throw new OwnershipVerificationError(
      "rpc",
      `could not determine whether ${address} is deployed: ${msg}`
    );
  }
}

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
      const lastTwo = hexed.slice(-2);
      const firstTwo = hexed.slice(0, 2);
      return lastTwo[0] === firstTwo[0] && lastTwo[1] === firstTwo[1] ? [lastTwo] : [lastTwo, firstTwo];
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

  if (deployed) {
    let rpcError: unknown;
    for (const candidate of signatureCandidates) {
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
  throw new OwnershipVerificationError(
    "offchain",
    "signature did not verify against any public key found in the account's constructor calldata"
  );
}
