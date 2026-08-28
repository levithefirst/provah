/**
 * Pure predicate math, shared verbatim between the server
 * (src/lib/predicate.ts, evaluating the caller's real deposit history) and
 * the client (ProvaApp.tsx's clientEvaluatePredicate, independently
 * re-deriving the same answer in-browser before /api/pass is ever called).
 *
 * Deliberately has no RPC, no DB, no fetch — every function here takes
 * already-fetched deposit records and does only arithmetic, so client and
 * server can never silently drift into evaluating "eligible" differently,
 * and so this file is unit-testable with plain fixtures
 * (scripts/test-predicate-math.ts), no wallet or network required.
 */

export type DepositLike = { amount: bigint; timestampSec: number };

/** deposit_count / balance_threshold with a minimum of 0: the Capability
 * Smoke Test shape, satisfied by literally any address including one with
 * zero on-chain history — needs no deposit history fetched at all. */
export function isAlwaysTruePredicate(predicateType: string, minAmount: bigint): boolean {
  return (predicateType === "deposit_count" || predicateType === "balance_threshold") && minAmount === BigInt(0);
}

/**
 * held_since (and balance_threshold, which is held_since with minDays = 0):
 * sum every deposit made at least minDays ago, evidence being the deposits
 * that counted toward that sum.
 */
export function evaluateHeldSince<T extends DepositLike>(
  deposits: T[],
  minAmount: bigint,
  minDays: number,
  nowSec: number = Math.floor(Date.now() / 1000)
): { eligible: boolean; total: bigint; evidence: T[] } {
  const cutoff = nowSec - minDays * 86400;
  let running = BigInt(0);
  const evidence: T[] = [];
  for (const d of deposits) {
    if (d.timestampSec > cutoff) continue; // must have been deposited before the cutoff
    running += d.amount;
    evidence.push(d);
  }
  return { eligible: running >= minAmount, total: running, evidence };
}

/** deposit_count: number of separate deposits >= minCount, regardless of amount. */
export function evaluateDepositCount<T>(deposits: T[], minCount: bigint): { eligible: boolean; count: number } {
  return { eligible: BigInt(deposits.length) >= minCount, count: deposits.length };
}
