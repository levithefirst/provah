#!/usr/bin/env -S npx tsx
/**
 * Regression test for the SNIP-12 ownership typed-data used by /api/pass and
 * ProvaApp.tsx's handleGeneratePass (src/lib/passChallenge.ts).
 *
 * Locks in the exact bug that shipped once: the typed-data's domain type was
 * named "StarknetDomain" (SNIP-12 revision 1's name) but neither the type
 * definition nor the domain object carried a "revision" field. Neither of
 * starknet.js's two known revisions matched, so validateTypedData() silently
 * returned false and getMessageHash() threw — which /api/pass's
 * `.catch(() => false)` turned into a plain 403 that looked identical to
 * "not eligible" for every wallet, every time.
 *
 * Uses only starknet.js and the real, shared issuePassTypedData() builder —
 * no wallet, no database, no RPC. Run with: npm run test:typed-data
 */
import assert from "node:assert/strict";
import { typedData as starknetTypedData, type TypedData } from "starknet";
import { issuePassTypedData } from "../src/lib/passChallenge";

const SAMPLE_CAMPAIGN_ID = "0x2df11a90c5a246beb0c7b59cc13e3d73e3c7ae1de5a00f9d71bee9fb2720582";
const SAMPLE_ADDRESS = "0x011c79a4697d55de8df336b0ce9cb832af6ef442373f41c479a6af4c8a0cf258";

function stripDomainRevision(td: TypedData): TypedData {
  // Reproduce the exact regression: same shape, minus the "revision" field
  // on both the type definition and the domain object.
  const broken = structuredClone(td) as TypedData;
  broken.types.StarknetDomain = broken.types.StarknetDomain.filter(
    (field) => field.name !== "revision"
  );
  const domain = { ...broken.domain } as Record<string, unknown>;
  delete domain.revision;
  broken.domain = domain;
  return broken;
}

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

console.log("Positive: current issuePassTypedData() shape");
const good = issuePassTypedData(SAMPLE_CAMPAIGN_ID);

check("has revision on types.StarknetDomain", () => {
  const hasRevisionField = good.types.StarknetDomain.some((f) => f.name === "revision");
  assert.equal(hasRevisionField, true);
});

check("has revision on domain", () => {
  assert.equal(good.domain.revision, "1");
});

check("validateTypedData() accepts it", () => {
  assert.equal(starknetTypedData.validateTypedData(good), true);
});

check("getMessageHash() returns a 0x-hex hash", () => {
  const hash = starknetTypedData.getMessageHash(good, SAMPLE_ADDRESS);
  assert.match(hash, /^0x[0-9a-f]+$/i);
});

console.log("\nNegative: same payload with revision stripped (the shipped bug)");
const broken = stripDomainRevision(good);

check("validateTypedData() rejects it", () => {
  assert.equal(starknetTypedData.validateTypedData(broken), false);
});

check("getMessageHash() throws", () => {
  assert.throws(() => starknetTypedData.getMessageHash(broken, SAMPLE_ADDRESS));
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All typed-data checks passed.");
