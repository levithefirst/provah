#!/usr/bin/env -S npx tsx
/**
 * Fixture-based regression test for src/lib/predicateMath.ts — the pure
 * predicate arithmetic shared verbatim between predicate.ts (server, real
 * deposit history) and ProvaApp.tsx's clientEvaluatePredicate (browser,
 * independent self-check). No RPC, no DB, no wallet: every deposit is a
 * plain fixture. Run with: npm run test:predicate-math
 */
import assert from "node:assert/strict";
import { evaluateDepositCount, evaluateHeldSince, isAlwaysTruePredicate } from "../src/lib/predicateMath";

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok — ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL — ${label}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("isAlwaysTruePredicate — the Capability Smoke Test short-circuit");
check("deposit_count, min 0 -> always true", () => {
  assert.equal(isAlwaysTruePredicate("deposit_count", BigInt(0)), true);
});
check("balance_threshold, min 0 -> always true", () => {
  assert.equal(isAlwaysTruePredicate("balance_threshold", BigInt(0)), true);
});
check("deposit_count, min 1 -> not always true", () => {
  assert.equal(isAlwaysTruePredicate("deposit_count", BigInt(1)), false);
});
check("held_since, min 0 -> not always true (a holding period still applies)", () => {
  assert.equal(isAlwaysTruePredicate("held_since", BigInt(0)), false);
});

console.log("\nevaluateHeldSince — cutoff behavior");
const nowSec = 1_700_000_000;
const oneDay = 86400;
const deposits = [
  { amount: BigInt(10), timestampSec: nowSec - 30 * oneDay }, // well before a 7-day cutoff
  { amount: BigInt(5), timestampSec: nowSec - 1 * oneDay }, // inside a 7-day cutoff (too recent)
  { amount: BigInt(20), timestampSec: nowSec - 7 * oneDay - 1 }, // exactly one second before the 7-day cutoff
];

check("only deposits before the cutoff count toward the total", () => {
  const { total, evidence } = evaluateHeldSince(deposits, BigInt(0), 7, nowSec);
  assert.equal(total, BigInt(30)); // 10 + 20, the 1-day-old deposit is excluded
  assert.equal(evidence.length, 2);
});
check("eligible when the pre-cutoff total meets the minimum", () => {
  assert.equal(evaluateHeldSince(deposits, BigInt(30), 7, nowSec).eligible, true);
});
check("ineligible when the pre-cutoff total falls short (recent deposit doesn't count)", () => {
  assert.equal(evaluateHeldSince(deposits, BigInt(31), 7, nowSec).eligible, false);
});
check("balance_threshold (minDays = 0) counts everything up to now", () => {
  const { total } = evaluateHeldSince(deposits, BigInt(0), 0, nowSec);
  assert.equal(total, BigInt(35));
});
check("empty deposit history is ineligible for any positive minimum", () => {
  assert.equal(evaluateHeldSince([], BigInt(1), 7, nowSec).eligible, false);
});

console.log("\nevaluateDepositCount — count-based, min-reached early-satisfaction shape");
check("count meets minimum exactly -> eligible", () => {
  const threeDeposits = [{ amount: BigInt(1), timestampSec: 0 }, { amount: BigInt(1), timestampSec: 0 }, { amount: BigInt(1), timestampSec: 0 }];
  assert.equal(evaluateDepositCount(threeDeposits, BigInt(3)).eligible, true);
});
check("count one short of minimum -> ineligible", () => {
  const twoDeposits = [{ amount: BigInt(1), timestampSec: 0 }, { amount: BigInt(1), timestampSec: 0 }];
  assert.equal(evaluateDepositCount(twoDeposits, BigInt(3)).eligible, false);
});
check("zero deposits, min 0 -> eligible (the smoke test itself)", () => {
  assert.equal(evaluateDepositCount([], BigInt(0)).eligible, true);
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All predicate-math checks passed.");
