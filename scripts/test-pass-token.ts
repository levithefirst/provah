#!/usr/bin/env -S npx tsx
/**
 * Regression test for src/lib/passToken.ts (the bearer-pass QR/text
 * encoding used by "redeem a pass someone gave you"). Plain round-trip +
 * garbage-rejection fixtures, no browser required. Run with:
 * npm run test:pass-token
 */
import assert from "node:assert/strict";
import { decodePassToken, encodePassToken } from "../src/lib/passToken";

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

const campaignId = "0x2df11a90c5a246beb0c7b59cc13e3d73e3c7ae1de5a00f9d71bee9fb2720582";
const nullifier = "0x11c79a4697d55de8df336b0ce9cb832af6ef442373f41c479a6af4c8a0cf258";

console.log("Round-trip");
check("encode then decode recovers the original fields", () => {
  const token = encodePassToken(campaignId, nullifier);
  const decoded = decodePassToken(token);
  assert.deepEqual(decoded, { campaignId, nullifier });
});
check("surrounding whitespace (a copy-paste artifact) is tolerated", () => {
  const token = `  ${encodePassToken(campaignId, nullifier)}\n`;
  assert.deepEqual(decodePassToken(token), { campaignId, nullifier });
});

console.log("\nGarbage rejection");
check("not base64 at all -> null, not a throw", () => {
  assert.equal(decodePassToken("definitely not a pass token"), null);
});
check("valid base64 JSON but missing nullifier -> null", () => {
  const token = btoa(JSON.stringify({ v: 1, campaignId }));
  assert.equal(decodePassToken(token), null);
});
check("valid base64 JSON but missing campaignId -> null", () => {
  const token = btoa(JSON.stringify({ v: 1, nullifier }));
  assert.equal(decodePassToken(token), null);
});
check("valid base64, valid JSON, but not an object (e.g. a bare number) -> null", () => {
  assert.equal(decodePassToken(btoa("42")), null);
});
check("campaignId present but not a string (e.g. a number) -> null, not a false positive", () => {
  const token = btoa(JSON.stringify({ v: 1, campaignId: 42, nullifier }));
  assert.equal(decodePassToken(token), null);
});
check("empty string -> null", () => {
  assert.equal(decodePassToken(""), null);
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All pass-token checks passed.");
