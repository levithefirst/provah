#!/usr/bin/env -S npx tsx
/**
 * API-contract regression test for /api/claim's post-lock decision logic
 * (src/lib/claimDecision.ts) — bound-recipient mismatch -> 403, expired ->
 * 410, malformed recipient -> 400 — with plain fixtures instead of a real
 * Postgres/RPC. The "already issued/claiming" race itself is enforced by
 * the route's own atomic UPDATE ... WHERE status = 'issued' (see
 * /api/claim/route.ts) and isn't re-decided here, since a plain read-then-
 * check couldn't close that race in the first place.
 * Run with: npm run test:claim-decision
 */
import assert from "node:assert/strict";
import { decideClaim, type ClaimCheck } from "../src/lib/claimDecision";

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

const NOW = 1_700_000_000_000; // ms
const RECIPIENT = "0x011c79a4697d55de8df336b0ce9cb832af6ef442373f41c479a6af4c8a0cf258";
const OTHER = "0x02abbefdcbf731195ee2acd186441eb536e86f888327b3655cffbd07b57dbf26";

const bearer: ClaimCheck = { passExists: true, expiresAtMs: NOW + 1_000_000, boundRecipient: null };

console.log("Happy path");
check("bearer pass, any recipient -> ok", () => {
  assert.deepEqual(decideClaim(bearer, RECIPIENT, NOW), { ok: true });
});
check("locked pass, matching recipient -> ok", () => {
  const locked: ClaimCheck = { ...bearer, boundRecipient: RECIPIENT };
  assert.deepEqual(decideClaim(locked, RECIPIENT, NOW), { ok: true });
});

console.log("\nEach failure mode maps to its own distinct status/error");
check("no such pass -> 404", () => {
  const result = decideClaim({ passExists: false, expiresAtMs: null, boundRecipient: null }, RECIPIENT, NOW);
  assert.deepEqual(result, { ok: false, status: 404, error: "no such pass" });
});
check("expired pass -> 410", () => {
  const expired: ClaimCheck = { ...bearer, expiresAtMs: NOW - 1 };
  assert.deepEqual(decideClaim(expired, RECIPIENT, NOW), { ok: false, status: 410, error: "this pass has expired" });
});
check("locked pass, wrong recipient -> 403", () => {
  const locked: ClaimCheck = { ...bearer, boundRecipient: RECIPIENT };
  assert.deepEqual(decideClaim(locked, OTHER, NOW), {
    ok: false,
    status: 403,
    error: "this pass is locked to a different destination wallet",
  });
});
check("malformed recipient on a bearer pass -> 400, clear message, not a thrown exception", () => {
  const result = decideClaim(bearer, "not-an-address", NOW);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 400);
});
check("malformed recipient against a locked pass is also a clean 400, not a crash", () => {
  const locked: ClaimCheck = { ...bearer, boundRecipient: RECIPIENT };
  const result = decideClaim(locked, "garbage", NOW);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 400);
});
check("expiry is checked before the bound-recipient mismatch", () => {
  const expiredAndLocked: ClaimCheck = { ...bearer, expiresAtMs: NOW - 1, boundRecipient: RECIPIENT };
  const result = decideClaim(expiredAndLocked, OTHER, NOW);
  assert.equal((result as { error: string }).error, "this pass has expired");
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All claim-decision checks passed.");
