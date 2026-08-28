/**
 * Maps /api/claim's error shapes to distinct, actionable copy — pulled out
 * of ProvaApp.tsx so it's testable with plain fixtures
 * (scripts/test-claim-copy.ts), no browser required.
 *
 * In particular: "attester/operator not configured" (a server
 * misconfiguration, nothing the user can fix), "already claiming" (a
 * genuinely in-flight request — try again shortly), and "already claimed"
 * (done, not an error) must never collapse into the same generic "Claim
 * failed" text, since they call for entirely different reactions.
 */
export function claimFailureMessage(status: number, data: { error?: string; detail?: string }): string {
  if (data.error === "attester_not_configured" || data.error === "operator_not_configured") {
    return `Provah's server isn't configured to sign claims right now (${data.detail ?? data.error}). This is a Provah misconfiguration, not something wrong with your pass — try again later.`;
  }
  if (status === 409 && typeof data.error === "string" && data.error.includes("already claiming")) {
    return "Another claim for this exact pass is already in progress. Wait a few seconds and try again — this is not a failure, just a request that's still running.";
  }
  if (status === 409 && typeof data.error === "string" && data.error.includes("already claimed")) {
    return "This pass has already been claimed — the nullifier is consumed and can't be reused.";
  }
  return `Claim failed: ${data.error}`;
}
