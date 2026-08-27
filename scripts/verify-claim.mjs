#!/usr/bin/env node
/**
 * Independent verification of a Provah claim, using ONLY public Starknet
 * RPC — no dependency on Provah's backend, API, or database. Anyone can
 * run this (a judge, a user, a skeptic) to confirm a claim actually
 * happened on mainnet, without trusting anything this project's UI says.
 *
 * This is the CLI equivalent of the "Verify on-chain" button in the app —
 * same is_nullifier_consumed call, same public RPC, run from a terminal
 * instead of a browser.
 *
 * Usage:
 *   node scripts/verify-claim.mjs <nullifier> [recipientAddress] [beforeBalanceWei]
 *
 *   <nullifier>          required. The pass's nullifier (0x...), as shown
 *                        in the app or recorded in strk20.json.
 *   [recipientAddress]   optional. If given, also reads this address's
 *                        current STRK balance from public RPC.
 *   [beforeBalanceWei]   optional. If given alongside recipientAddress,
 *                        prints the delta against this balance (wei) —
 *                        useful for confirming a reward-campaign payout.
 *
 * No environment variables or secrets are required. STARKNET_RPC_URL can
 * override the default public endpoint.
 */
import { RpcProvider } from "starknet";

const RPC_URL = process.env.STARKNET_RPC_URL || "https://rpc.starknet.lava.build:443/rpc/v0_9";
const PROVA_PASS_CONTRACT_ADDRESS = "0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402";
const STRK_TOKEN_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const [nullifier, recipient, beforeBalanceWei] = process.argv.slice(2);

if (!nullifier) {
  console.error("Usage: node scripts/verify-claim.mjs <nullifier> [recipientAddress] [beforeBalanceWei]");
  console.error("");
  console.error("Example (capability only):");
  console.error("  node scripts/verify-claim.mjs 0x1a2b3c...");
  console.error("");
  console.error("Example (reward campaign, with balance delta):");
  console.error("  node scripts/verify-claim.mjs 0x1a2b3c... 0xrecipient... 0");
  process.exit(1);
}

function provider() {
  return new RpcProvider({ nodeUrl: RPC_URL });
}

async function main() {
  const p = provider();
  console.log(`RPC: ${RPC_URL}`);
  console.log(`ProvaPass contract: ${PROVA_PASS_CONTRACT_ADDRESS}`);
  console.log(`Nullifier: ${nullifier}`);
  console.log("");

  const result = await p.callContract({
    contractAddress: PROVA_PASS_CONTRACT_ADDRESS,
    entrypoint: "is_nullifier_consumed",
    calldata: [nullifier],
  });
  const consumed = BigInt(result[0] ?? "0x0") === BigInt(1);

  if (consumed) {
    console.log("PASS — nullifier is consumed on-chain. This pass has been claimed exactly once.");
  } else {
    console.log("FAIL — nullifier is NOT consumed on-chain. Either this pass hasn't been claimed yet,");
    console.log("or the nullifier value is wrong.");
  }

  if (recipient) {
    console.log("");
    console.log(`Recipient: ${recipient}`);
    const balResult = await p.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: "balanceOf",
      calldata: [recipient],
    });
    const balance = BigInt(balResult[0] ?? "0x0");
    console.log(`Current STRK balance: ${balance.toString()} wei (${Number(balance) / 1e18} STRK)`);

    if (beforeBalanceWei !== undefined) {
      const before = BigInt(beforeBalanceWei);
      const delta = balance - before;
      if (delta > BigInt(0)) {
        console.log(`Delta since before-balance: +${delta.toString()} wei (+${Number(delta) / 1e18} STRK)`);
        console.log("PASS — recipient's STRK balance increased, confirming a real reward payout.");
      } else {
        console.log(`Delta since before-balance: ${delta.toString()} wei — no increase observed.`);
      }
    }
  }

  process.exit(consumed ? 0 : 1);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
