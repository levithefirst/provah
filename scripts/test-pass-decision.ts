#!/usr/bin/env -S npx tsx
/**
 * API-contract regression test for /api/pass's decision logic
 * (src/lib/passDecision.ts) — the exact status-code/error shape for every
 * non-signature, non-eligibility failure mode, with plain fixtures instead
 * of a real Postgres/RPC. Run with: npm run test:pass-decision
 */
import assert from "node:assert/strict";
import { decidePassIssuance, type PassIssuanceCheck } from "../src/lib/passDecision";

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

const NOW = 1_700_000_000;
const baseline: PassIssuanceCheck = {
  campaignExists: true,
  campaignStatus: "active",
  campaignExpirySec: NOW + 1_000_000,
  nullifierAlreadyUsed: false,
  alreadyIssuedForWallet: false,
  enforceOnePerWallet: true,
};

console.log("Happy path");
check("all clear -> ok", () => {
  assert.deepEqual(decidePassIssuance(baseline, NOW), { ok: true });
});

console.log("\nEach failure mode maps to its own distinct status/error, never lumped as 'not eligible'");
check("no such campaign -> 404", () => {
  const result = decidePassIssuance({ ...baseline, campaignExists: false }, NOW);
  assert.deepEqual(result, { ok: false, status: 404, error: "no such campaign" });
});
check("campaign not active -> 400", () => {
  const result = decidePassIssuance({ ...baseline, campaignStatus: "paused" }, NOW);
  assert.deepEqual(result, { ok: false, status: 400, error: "campaign not active" });
});
check("campaign expired -> 400, distinct from 'not active'", () => {
  const result = decidePassIssuance({ ...baseline, campaignExpirySec: NOW - 1 }, NOW);
  assert.deepEqual(result, { ok: false, status: 400, error: "campaign expired" });
});
check("campaign with no expiry set never expires", () => {
  const result = decidePassIssuance({ ...baseline, campaignExpirySec: null }, NOW);
  assert.deepEqual(result, { ok: true });
});
check("duplicate nullifier -> 409", () => {
  const result = decidePassIssuance({ ...baseline, nullifierAlreadyUsed: true }, NOW);
  assert.deepEqual(result, { ok: false, status: 409, error: "pass already issued for this input" });
});
check("reward campaign, wallet already issued a pass -> 409, distinct message", () => {
  const result = decidePassIssuance({ ...baseline, alreadyIssuedForWallet: true, enforceOnePerWallet: true }, NOW);
  assert.deepEqual(result, {
    ok: false,
    status: 409,
    error: "this wallet has already been issued a pass for this campaign",
  });
});
check("missing campaign is checked before anything else about that (nonexistent) campaign", () => {
  const result = decidePassIssuance(
    {
      campaignExists: false,
      campaignStatus: null,
      campaignExpirySec: null,
      nullifierAlreadyUsed: true,
      alreadyIssuedForWallet: true,
      enforceOnePerWallet: true,
    },
    NOW
  );
  assert.equal(result.ok, false);
  assert.equal((result as { error: string }).error, "no such campaign");
});

console.log("\nMulti-pass policy: reward campaigns enforce one-per-wallet, non-reward campaigns don't");
check("non-reward campaign (enforceOnePerWallet: false): repeat wallet is allowed even if alreadyIssuedForWallet is true", () => {
  // alreadyIssuedForWallet true here simulates a caller that (incorrectly,
  // or from stale data) still found a prior row — the policy itself must
  // still allow it through when the campaign has no reward, since that's
  // the whole point of not enforcing one-per-wallet for these.
  const result = decidePassIssuance({ ...baseline, enforceOnePerWallet: false, alreadyIssuedForWallet: true }, NOW);
  assert.deepEqual(result, { ok: true });
});
check("non-reward campaign, no prior issuance either -> ok (the common case)", () => {
  const result = decidePassIssuance(
    { ...baseline, enforceOnePerWallet: false, alreadyIssuedForWallet: false },
    NOW
  );
  assert.deepEqual(result, { ok: true });
});
check("duplicate nullifier is still rejected even on a non-reward campaign", () => {
  // Nullifier uniqueness is a different guarantee (no double-claim) than
  // one-pass-per-wallet (no reward-pool drain) — the multi-pass policy
  // must never touch this one.
  const result = decidePassIssuance({ ...baseline, enforceOnePerWallet: false, nullifierAlreadyUsed: true }, NOW);
  assert.deepEqual(result, { ok: false, status: 409, error: "pass already issued for this input" });
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All pass-decision checks passed.");
