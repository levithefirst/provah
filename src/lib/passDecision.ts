/**
 * Pure decision logic for /api/pass, pulled out of the route handler so the
 * exact status-code/error contract can be unit-tested with fixtures
 * (scripts/test-pass-decision.ts) without a real Postgres or RPC — the
 * route just gathers these booleans from the DB/chain and hands them here.
 */

export type PassIssuanceCheck = {
  campaignExists: boolean;
  campaignStatus: string | null;
  campaignExpirySec: number | null;
  nullifierAlreadyUsed: boolean;
  alreadyIssuedForWallet: boolean;
};

export type Decision = { ok: true } | { ok: false; status: number; error: string };

export function decidePassIssuance(check: PassIssuanceCheck, nowSec: number): Decision {
  if (!check.campaignExists) return { ok: false, status: 404, error: "no such campaign" };
  if (check.campaignStatus !== "active") return { ok: false, status: 400, error: "campaign not active" };
  if (check.campaignExpirySec !== null && check.campaignExpirySec < nowSec) {
    return { ok: false, status: 400, error: "campaign expired" };
  }
  if (check.nullifierAlreadyUsed) {
    return { ok: false, status: 409, error: "pass already issued for this input" };
  }
  if (check.alreadyIssuedForWallet) {
    return {
      ok: false,
      status: 409,
      error: "this wallet has already been issued a pass for this campaign",
    };
  }
  return { ok: true };
}
