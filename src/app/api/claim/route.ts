import { NextRequest, NextResponse } from "next/server";
import { Contract } from "starknet";
import { db } from "@/lib/db";
import { operatorAccount, provider, withOperatorLock } from "@/lib/starknet";
import { PROVA_PASS_ABI } from "@/lib/provaPassAbi";
import { PROVA_PASS_CONTRACT_ADDRESS } from "@/lib/config";
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
  try {
    const body = await req.json();
    const campaignId: string = body.campaignId;
    const nullifier: string = body.nullifier;
    const recipient: string = body.recipient;

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

    // Atomic compare-and-swap: a plain SELECT-then-check here would let two
    // concurrent claims for the same pass (a double-click, two tabs, or a
    // paste-token race between the original wallet and whoever it was
    // shared with) both read "issued" and both submit an on-chain
    // transaction — wasting the gas Prova sponsors, and racing the
    // operator account's nonce (see withOperatorLock) for no reason. This
    // UPDATE only ever succeeds for exactly one concurrent caller; anyone
    // else gets zero rows back and a clean 409 below, before any signature
    // is even computed.
    let locked;
    try {
      locked = await db().query(
        `UPDATE prova_passes SET status = 'claiming'
         WHERE nullifier = $1 AND campaign_id = $2 AND status = 'issued'
         RETURNING *`,
        [nullifier, campaignId]
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
      await db().query(`UPDATE prova_passes SET status = 'issued' WHERE nullifier = $1 AND status = 'claiming'`, [
        nullifier,
      ]);
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

    const sig = signAttestation(BigInt(campaignId), BigInt(nullifier), BigInt(recipient));

    let transaction_hash: string;
    try {
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
        await provider().waitForTransaction(transaction_hash);
        return transaction_hash;
      });
    } catch (err) {
      // The on-chain submission itself failed (nonce race, RPC error,
      // reverted transaction) — unlock so the pass is retryable rather than
      // stuck in 'claiming' forever, then report the real error.
      await unlock();
      throw err;
    }

    await db().query(
      `INSERT INTO claims (campaign_id, nullifier, recipient, tx_hash, status, confirmed_at)
       VALUES ($1,$2,$3,$4,'confirmed', now())`,
      [campaignId, nullifier, recipient, transaction_hash]
    );
    await db().query(`UPDATE prova_passes SET status = 'claimed' WHERE nullifier = $1`, [nullifier]);
    await db().query(`INSERT INTO mainnet_activity_log (kind, tx_hash, detail) VALUES ($1,$2,$3)`, [
      "claim",
      transaction_hash,
      JSON.stringify({ campaignId, nullifier, recipient }),
    ]);

    return NextResponse.json({ ok: true, txHash: transaction_hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
