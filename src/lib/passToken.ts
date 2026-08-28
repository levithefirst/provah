/**
 * Pass token encode/decode — pulled out of ProvaApp.tsx so it's testable
 * with plain fixtures (scripts/test-pass-token.ts), no browser required.
 * Uses the global atob/btoa (available in browsers, Node 16+, and the Edge
 * runtime alike) instead of window.btoa/window.atob, so there's no
 * SSR-only-safe guard needed — these are pure functions everywhere they run.
 */

export type DecodedPassToken = { campaignId: string; nullifier: string };

export function encodePassToken(campaignId: string, nullifier: string): string {
  const json = JSON.stringify({ v: 1, campaignId, nullifier });
  return btoa(json);
}

export function decodePassToken(token: string): DecodedPassToken | null {
  try {
    const parsed = JSON.parse(atob(token.trim()));
    if (typeof parsed?.campaignId === "string" && typeof parsed?.nullifier === "string" && parsed.campaignId && parsed.nullifier) {
      return { campaignId: parsed.campaignId, nullifier: parsed.nullifier };
    }
    return null;
  } catch {
    return null;
  }
}
