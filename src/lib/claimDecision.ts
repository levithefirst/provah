/**
 * Pure decision logic for /api/claim, pulled out of the route handler so
 * the exact status-code/error contract (bound-recipient mismatch -> 403,
 * expired -> 410, already claimed -> 409, ...) can be unit-tested with
 * fixtures (scripts/test-claim-decision.ts) without a real Postgres or
 * chain — the route just gathers these fields from the DB and hands them
 * here. Does not decide the "already issued/claiming" race itself — that's
 * enforced atomically by the route's own compare-and-swap UPDATE, since a
 * plain read-then-check here couldn't close that race (see /api/claim).
 */

export type ClaimCheck = {
  passExists: boolean;
  expiresAtMs: number | null;
  boundRecipient: string | null;
};

export type Decision = { ok: true } | { ok: false; status: number; error: string };

export function decideClaim(check: ClaimCheck, recipient: string, nowMs: number): Decision {
  if (!check.passExists) return { ok: false, status: 404, error: "no such pass" };
  if (check.expiresAtMs !== null && check.expiresAtMs < nowMs) {
    return { ok: false, status: 410, error: "this pass has expired" };
  }
  let recipientFelt: bigint;
  try {
    recipientFelt = BigInt(recipient);
  } catch {
    // Checked unconditionally, not just for a locked pass — a bearer pass
    // with a malformed recipient would otherwise sail through here and only
    // fail later inside signAttestation's own BigInt(recipient), as an
    // opaque 500 instead of this clean 400.
    return { ok: false, status: 400, error: "recipient must be a valid address" };
  }
  if (check.boundRecipient && BigInt(check.boundRecipient) !== recipientFelt) {
    return { ok: false, status: 403, error: "this pass is locked to a different destination wallet" };
  }
  return { ok: true };
}
