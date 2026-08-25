import { Account, RpcProvider } from "starknet";
import { STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY } from "./config";

export function provider(): RpcProvider {
  return new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
}

/** Prova's own operating account — pays gas for deploying/administering ProvaPass. */
export function operatorAccount(): Account {
  if (!STARKNET_ACCOUNT_ADDRESS || !STARKNET_PRIVATE_KEY) {
    throw new Error("STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY not configured");
  }
  return new Account({
    provider: provider(),
    address: STARKNET_ACCOUNT_ADDRESS,
    signer: STARKNET_PRIVATE_KEY,
    cairoVersion: "1",
  });
}
