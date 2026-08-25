export const STARKNET_RPC_URL =
  process.env.STARKNET_RPC_URL ?? "https://rpc.starknet.lava.build";
export const STARKNET_CHAIN_ID = process.env.STARKNET_CHAIN_ID ?? "0x534e5f4d41494e";
export const STRK20_POOL_ADDRESS =
  process.env.STRK20_POOL_ADDRESS ??
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
export const STRK_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938";

export const PROVA_PASS_CONTRACT_ADDRESS = process.env.PROVA_PASS_CONTRACT_ADDRESS ?? "";
export const PROVA_PASS_CLASS_HASH = process.env.PROVA_PASS_CLASS_HASH ?? "";

export const PROVA_ATTESTER_PRIVATE_KEY = process.env.PROVA_ATTESTER_PRIVATE_KEY ?? "";
export const PROVA_ATTESTER_PUBLIC_KEY = process.env.PROVA_ATTESTER_PUBLIC_KEY ?? "";

export const STARKNET_ACCOUNT_ADDRESS = process.env.STARKNET_ACCOUNT_ADDRESS ?? "";
export const STARKNET_PRIVATE_KEY = process.env.STARKNET_PRIVATE_KEY ?? "";

export const PROVA_ADMIN_TOKEN = process.env.PROVA_ADMIN_TOKEN ?? "";

export function requireAdmin(token: string | null) {
  if (!PROVA_ADMIN_TOKEN || token !== PROVA_ADMIN_TOKEN) {
    throw new Error("unauthorized");
  }
}
