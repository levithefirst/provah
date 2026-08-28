#!/usr/bin/env -S npx tsx
/**
 * Regression test for claimFailureMessage (src/lib/claimCopy.ts) — the
 * client-side mapping from /api/claim's error shapes to distinct,
 * actionable status text. Locks in the P0 fix: a server misconfiguration
 * (missing attester/operator key), a genuinely in-flight claim, and an
 * already-consumed pass must never collapse into the same generic
 * "Claim failed: ..." text, since each calls for a different reaction
 * (wait for Prova to fix it / try again shortly / nothing to do, it
 * worked). Run with: npm run test:claim-copy
 */
import assert from "node:assert/strict";
import { claimFailureMessage } from "../src/lib/claimCopy";

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

console.log("Server misconfiguration — distinct from a per-pass failure");
check("attester_not_configured includes the server detail, not a generic message", () => {
  const msg = claimFailureMessage(503, {
    error: "attester_not_configured",
    detail: "PROVA_ATTESTER_PRIVATE_KEY is not set on the server.",
  });
  assert.match(msg, /misconfiguration/i);
  assert.match(msg, /PROVA_ATTESTER_PRIVATE_KEY is not set on the server\./);
});
check("operator_not_configured is mapped the same way as attester_not_configured", () => {
  const msg = claimFailureMessage(503, { error: "operator_not_configured", detail: "STARKNET_ACCOUNT_ADDRESS missing." });
  assert.match(msg, /misconfiguration/i);
});

console.log("\nGenuinely in-flight vs. already-done, both 409 but distinct");
check("'pass already claiming' -> try again shortly, not a failure", () => {
  const msg = claimFailureMessage(409, { error: "pass already claiming" });
  assert.match(msg, /already in progress/i);
  assert.doesNotMatch(msg, /^Claim failed/);
});
check("'pass already claimed' -> done, nullifier consumed, not a failure", () => {
  const msg = claimFailureMessage(409, { error: "pass already claimed" });
  assert.match(msg, /already been claimed/i);
  assert.doesNotMatch(msg, /^Claim failed/);
});
check("a 409 that isn't 'claiming' or 'claimed' still falls back to the generic message", () => {
  const msg = claimFailureMessage(409, { error: "pass already issued" });
  assert.match(msg, /^Claim failed: pass already issued$/);
});

console.log("\nEverything else falls back to the generic 'Claim failed' message");
check("a 403 (bound-recipient mismatch) uses the generic message with the real detail", () => {
  const msg = claimFailureMessage(403, { error: "this pass is locked to a different destination wallet" });
  assert.equal(msg, "Claim failed: this pass is locked to a different destination wallet");
});
check("a 410 (expired) uses the generic message", () => {
  const msg = claimFailureMessage(410, { error: "this pass has expired" });
  assert.equal(msg, "Claim failed: this pass has expired");
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All claim-copy checks passed.");
