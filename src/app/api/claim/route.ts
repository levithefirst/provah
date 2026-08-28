import { NextRequest, NextResponse } from "next/server";
import { Contract } from "starknet";
import { db } from "@/lib/db";
import { operatorAccount, provider, withOperatorLock } from "@/lib/starknet";
import { PROVA_PASS_ABI } from "@/lib/provaPassAbi";
import { PROVA_PASS_CONTRACT_ADDRESS, PROVA_ATTESTER_PRIVATE_KEY, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY } from "@/lib/config";
import { signAttestation } from "@/lib/attestation";
import { decideClaim } from "@/lib/claimDecision";

/**
 * Redeem a Prova Pass from ANY wallet. The caller supplies only
 * (campaignId, nullifier, recipient) — no viewing key, no link to whichever
 * wallet satisfied the predicate. Prova signs the one-time attestation here
 * and relays the claim transaction (gasless for the recipient: the fresh
 * wallet never needs to hold STRK to pay fees), which the ProvaPass contract
 * verifies and the nullifier registry consumes exactly once.
 */
export async function POST(req: NextRequest) {
  // Temporary diagnostic trail (P0: silent claim failures reported after the
  // attester rotation) — every line here is boolean/metadata only, never a
  // secret value, so it's safe to leave in server logs. The goal is to make
  // the NEXT failed claim attempt point at an exact stage instead of one
  // generic client-side "unreachable" message that collapses every failure
  // mode (network error, timeout, thrown exception) into the same text.
  console.log("[/api/claim] request received");
  try {
    const body = await req.json();
    const campaignId: string = body.campaignId;
    const nullifier: string = body.nullifier;
    const recipient: string = body.recipient;
    console.log("[/api/claim] validation stage reached", {
      hasCampaignId: !!campaignId,
      hasNullifier: !!nullifier,
      hasRecipient: !!recipient,
    });

    if (!campaignId || !nullifier || !recipient) {
      return NextResponse.json(
        { ok: false, error: "campaignId, nullifier, recipient required" },
        { status: 400 }
      );
    }
    try {
      BigInt(recipient);
    } catch {
      return NextResponse.json({ ok: false, error: "recipient must be a valid address" }, { status: 400 });
    }
    if (!PROVA_PASS_CONTRACT_ADDRESS) {
      return NextResponse.json({ ok: false, error: "contract not deployed yet" }, { status: 503 });
    }
    // Checked before any DB status transition — a missing attester key
    // used to throw from signAttestation() *after* the pass was already
    // locked to 'claiming', with nothing downstream to unlock it: every
    // claim attempt failed the same way and permanently stuck the pass.
    // Failing here means the pass is never touched at all when Prova
    // itself isn't configured to sign.
    console.log("[/api/claim] attester key present:", !!PROVA_ATTESTER_PRIVATE_KEY);
    if (!PROVA_ATTESTER_PRIVATE_KEY) {
      console.error("[/api/claim] PROVA_ATTESTER_PRIVATE_KEY is not set — refusing before touching the pass");
      return NextResponse.json(
        {
          ok: false,
          error: "attester_not_configured",
          detail:
            "PROVA_ATTESTER_PRIVATE_KEY is not set on the server. Set it in Vercel env (must match the on-chain ProvaPass attester) and redeploy.",
        },
        { status: 503 }
      );
    }
    console.log("[/api/claim] starknet operator vars present:", {
      account: !!STARKNET_ACCOUNT_ADDRESS,
      privateKey: !!STARKNET_PRIVATE_KEY,
    });
    if (!STARKNET_ACCOUNT_ADDRESS || !STARKNET_PRIVATE_KEY) {
      console.error("[/api/claim] STARKNET_ACCOUNT_ADDRESS/STARKNET_PRIVATE_KEY not set — refusing before touching the pass");
      return NextResponse.json(
        {
          ok: false,
          error: "operator_not_configured",
          detail:
            "STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY are not set on the server. Set them in Vercel env (the account that sponsors claim gas) and redeploy.",
        },
        { status: 503 }
      );
    }

    // Atomic compare-and-swap: a plain SELECT-then-check here would let two
    // concurrent claims for the same pass (a double-click, two tabs, or a
    // paste-token race between the original wallet and whoever it was
    // shared with) both read "issued" and both submit an on-chain
    // transaction — wasting the gas Prova sponsors, and racing the
    // operator account's nonce (see withOperatorLock) for no reason. This
    // UPDATE only ever succeeds for exactly one concurrent caller; anyone
    // else gets zero rows back and a clean 409 below, before any signature
    // is even computed.
    //
    // Also re-locks a STALE 'claiming' row (older than CLAIMING_TTL) as if
    // it were 'issued'. try/catch alone can revert a failed claim back to
    // 'issued', but can't protect against the serverless function itself
    // being killed mid-request (a Vercel timeout while awaiting on-chain
    // confirmation, which can take longer than a function's time budget) —
    // there's no code left running at that point to call unlock(). This is
    // the fallback for exactly that case: "pass already claiming" only
    // blocks a request that's genuinely still in flight, not one that died
    // silently minutes ago.
    const CLAIMING_TTL_SECONDS = 120;
    let locked;
    try {
      locked = await db().query(
        `UPDATE prova_passes SET status = 'claiming', claiming_at = now()
         WHERE nullifier = $1 AND campaign_id = $2
           AND (
             status = 'issued'
             OR (status = 'claiming' AND (claiming_at IS NULL OR claiming_at < now() - make_interval(secs => $3)))
           )
         RETURNING *`,
        [nullifier, campaignId, CLAIMING_TTL_SECONDS]
      );
    } catch (err) {
      // Fails loudly and specifically rather than as an opaque 500: if the
      // live `prova_passes.status` column has a CHECK constraint that
      // doesn't yet allow 'claiming' (not independently re-verified against
      // the live schema when this lock was added — see STATUS.md "Pre-demo
      // QA" residual risks), this is exactly the error it would throw.
      const pgCode = (err as { code?: string } | null)?.code;
      if (pgCode === "23514" /* check_violation */) {
        console.error(
          "[/api/claim] prova_passes.status rejected 'claiming' — the column's CHECK constraint needs updating to allow it:",
          err instanceof Error ? err.message : String(err)
        );
        return NextResponse.json(
          { ok: false, error: "server misconfiguration: claim-lock status value not allowed by schema" },
          { status: 500 }
        );
      }
      throw err;
    }
    const pass = locked.rows[0];
    if (!pass) {
      const existing = await db().query(
        `SELECT * FROM prova_passes WHERE nullifier = $1 AND campaign_id = $2`,
        [nullifier, campaignId]
      );
      const found = existing.rows[0];
      if (!found) return NextResponse.json({ ok: false, error: "no such pass" }, { status: 404 });
      return NextResponse.json({ ok: false, error: `pass already ${found.status}` }, { status: 409 });
    }

    // Reverts the 'claiming' lock back to 'issued' so a rejected or failed
    // claim can be retried instead of leaving the pass permanently stuck —
    // only ever called before any on-chain submission happens.
    async function unlock() {
      await db().query(
        `UPDATE prova_passes SET status = 'issued', claiming_at = NULL WHERE nullifier = $1 AND status = 'claiming'`,
        [nullifier]
      );
    }

    // The contract already enforces campaign expiry on-chain
    // (`assert(get_block_timestamp() <= expiry)`), so this can't be
    // bypassed even if this check were skipped — but checking here first
    // avoids relaying a transaction we already know will revert, at
    // Prova's own gas expense, for a stale pass. Same for the bound-
    // recipient check: enforced before signing, not just documented as a
    // bearer-security caveat.
    const decision = decideClaim(
      {
        passExists: true,
        expiresAtMs: new Date(pass.expires_at).getTime(),
        boundRecipient: pass.bound_recipient ?? null,
      },
      recipient,
      Date.now()
    );
    if (!decision.ok) {
      await unlock();
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
    }

    // Guarded on its own: this is exactly the call that used to throw
    // "PROVA_ATTESTER_PRIVATE_KEY not configured" *after* the lock above
    // had already set status = 'claiming', with no unlock reachable from
    // here — every retry hit the same throw and the pass was stuck for
    // good. The upfront config check further up should make this
    // unreachable in practice, but this stays guarded regardless: nothing
    // between acquiring the lock and a confirmed on-chain result should be
    // able to leave the pass stuck.
    let sig: { r: string; s: string };
    try {
      sig = signAttestation(BigInt(campaignId), BigInt(nullifier), BigInt(recipient));
      console.log("[/api/claim] attester signature generated successfully");
    } catch (err) {
      await unlock();
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[/api/claim] signAttestation failed after acquiring the claim lock — unlocked:", detail);
      return NextResponse.json(
        { ok: false, error: "attester_not_configured", detail },
        { status: 503 }
      );
    }

    let transaction_hash: string;
    try {
      console.log("[/api/claim] submitting claim_with_prova_pass to Starknet...");
      transaction_hash = await withOperatorLock(async () => {
        const account = operatorAccount();
        const contract = new Contract({
          abi: PROVA_PASS_ABI,
          address: PROVA_PASS_CONTRACT_ADDRESS,
          providerOrAccount: account,
        });
        const call = contract.populate("claim_with_prova_pass", [
          campaignId,
          nullifier,
          recipient,
          sig.r,
          sig.s,
        ]);
        const { transaction_hash } = await account.execute(call);
        // Logged as soon as the submission itself succeeds — a tx hash here
        // means the transaction is already out on the network regardless of
        // whether the waitForTransaction below (or this whole function) gets
        // to finish before Vercel's execution time budget runs out. This is
        // the exact fact a timed-out invocation would otherwise leave no
        // trace of: nothing client-side distinguishes "never submitted" from
        // "submitted, but the function died before confirming it."
        console.log("[/api/claim] transaction submitted, tx hash:", transaction_hash);
        await provider().waitForTransaction(transaction_hash);
        console.log("[/api/claim] transaction confirmed:", transaction_hash);
        return transaction_hash;
      });
    } catch (err) {
      // The on-chain submission itself failed (nonce race, RPC error,
      // reverted transaction) — unlock so the pass is retryable rather than
      // stuck in 'claiming' forever, then report the real error.
      console.error("[/api/claim] on-chain submission failed:", {
        name: err instanceof Error ? err.constructor.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
      });
      await unlock();
      throw err;
    }

    // The on-chain claim already succeeded and the nullifier is already
    // consumed on-chain by this point — nothing below this line may ever
    // turn this response into a failure or call unlock(). Reverting status
    // to 'issued' after a real on-chain success would invite a doomed
    // retry (the contract will reject the already-consumed nullifier), and
    // reporting a 500 for a claim that actually went through is worse than
    // the bug this whole route was rewritten to fix. Status update to
    // 'claimed' is the one still-important state transition; the claims
    // row and activity log are best-effort telemetry.
    try {
      await db().query(`UPDATE prova_passes SET status = 'claimed' WHERE nullifier = $1`, [nullifier]);
    } catch (err) {
      console.error(
        "[/api/claim] on-chain claim succeeded but updating status to 'claimed' failed (nullifier is still consumed on-chain):",
        err instanceof Error ? err.message : String(err)
      );
    }
    try {
      await db().query(
        `INSERT INTO claims (campaign_id, nullifier, recipient, tx_hash, status, confirmed_at)
         VALUES ($1,$2,$3,$4,'confirmed', now())`,
        [campaignId, nullifier, recipient, transaction_hash]
      );
      await db().query(`INSERT INTO mainnet_activity_log (kind, tx_hash, detail) VALUES ($1,$2,$3)`, [
        "claim",
        transaction_hash,
        JSON.stringify({ campaignId, nullifier, recipient }),
      ]);
    } catch (err) {
      console.error(
        "[/api/claim] on-chain claim succeeded but a bookkeeping insert failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    return NextResponse.json({ ok: true, txHash: transaction_hash });
  } catch (err) {
    // Previously silent — this outer catch is what turns a Vercel function
    // timeout, a thrown RPC error, or any other unhandled exception into a
    // generic 500 with no server-side trace of what actually happened. Every
    // other catch block in this route logs before returning; this is the
    // one gap where a real failure could vanish without a log line, so it's
    // now the last thing checked when a claim looks like it "failed" for no
    // visible reason.
    console.error("[/api/claim] top-level error:", {
      name: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
