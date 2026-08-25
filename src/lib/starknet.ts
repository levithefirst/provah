import { Account, RpcProvider, Signer, ec } from "starknet";
import { STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY } from "./config";

export function provider(): RpcProvider {
  return new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
}

/**
 * Prova's operating wallet is an Argent account (confirmed on mainnet via a
 * live "invalid signature length" revert). Argent's current account
 * contract expects a SignerSignature-wrapped format — [signer_type=Starknet,
 * pubkey, r, s] — not the plain [r, s] starknet.js's default Signer produces.
 * See argentlabs/argent-contracts-starknet/docs/signers_and_signatures.md.
 */
class ArgentSigner extends Signer {
  async signRaw(msgHash: string): Promise<string[]> {
    const sig = ec.starkCurve.sign(msgHash, this.pk);
    const pubkey = ec.starkCurve.getStarkKey(this.pk);
    return ["0x0", pubkey, "0x" + sig.r.toString(16), "0x" + sig.s.toString(16)];
  }
}

/** Prova's own operating account — pays gas for deploying/administering ProvaPass. */
export function operatorAccount(): Account {
  if (!STARKNET_ACCOUNT_ADDRESS || !STARKNET_PRIVATE_KEY) {
    throw new Error("STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY not configured");
  }
  return new Account({
    provider: provider(),
    address: STARKNET_ACCOUNT_ADDRESS,
    signer: new ArgentSigner(STARKNET_PRIVATE_KEY),
    cairoVersion: "1",
  });
}
