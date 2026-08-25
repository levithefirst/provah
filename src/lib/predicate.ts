import { hash, num } from "starknet";
import { provider } from "./starknet";
import { STRK20_POOL_ADDRESS } from "./config";

/**
 * Reads the STRK20 pool's public `Deposit` events for a given address.
 *
 * Deposits into the pool are public by design (Day-0 mainnet guide: "deposits
 * undergo compliance screening and are publicly visible") — so this is real,
 * on-chain, no-trust-required evidence, unlike the private note balance that
 * results afterward. It is the honest v1 predicate source: see README
 * "What is private / what is not" for why note-level history isn't used yet.
 */
export interface DepositRecord {
  amount: bigint;
  token: string;
  blockNumber: number;
  timestampSec: number;
  txHash: string;
}

const DEPOSIT_EVENT_KEY = num.toHex(hash.starknetKeccak("Deposit"));

export async function getDepositHistory(userAddress: string): Promise<DepositRecord[]> {
  const p = provider();
  const userFelt = num.toHex(userAddress);
  const events: DepositRecord[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await p.getEvents({
      address: STRK20_POOL_ADDRESS,
      keys: [[DEPOSIT_EVENT_KEY], [userFelt]],
      chunk_size: 100,
      continuation_token: continuationToken,
      from_block: { block_number: 0 },
      to_block: "latest",
    });

    for (const ev of page.events) {
      const [, token, amountLow] = ev.data ?? [];
      const block = await p.getBlockWithTxHashes(ev.block_hash ?? "latest");
      events.push({
        amount: BigInt(amountLow ?? "0"),
        token: token ?? "",
        blockNumber: ev.block_number ?? 0,
        timestampSec: "timestamp" in block ? (block.timestamp as number) : 0,
        txHash: ev.transaction_hash,
      });
    }
    continuationToken = page.continuation_token;
  } while (continuationToken);

  return events;
}

export async function evaluateHeldSinceDays(
  userAddress: string,
  tokenAddress: string,
  minAmount: bigint,
  minDays: number
): Promise<{ eligible: boolean; evidence: DepositRecord[] }> {
  const deposits = (await getDepositHistory(userAddress)).filter(
    (d) => d.token.toLowerCase() === tokenAddress.toLowerCase()
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - minDays * 86400;

  let running = BigInt(0);
  const evidence: DepositRecord[] = [];
  for (const d of deposits.sort((a, b) => a.timestampSec - b.timestampSec)) {
    if (d.timestampSec > cutoff) continue; // must have been deposited before the cutoff
    running += d.amount;
    evidence.push(d);
  }

  return { eligible: running >= minAmount, evidence };
}
