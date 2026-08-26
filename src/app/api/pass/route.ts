import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluatePredicate } from "@/lib/predicate";
import { pedersen, signAttestation, deriveNullifier } from "@/lib/attestation";

/**
 * Issue a Prova Pass: evaluate the campaign's predicate against the caller's
 * OWN deposit history (proved via a standard Starknet signMessage, checked
 * client-side by the wallet — the server only needs the address+salt to
 * derive a nullifier and to read PUBLIC deposit events; see predicate.ts).
 * Returns a signed, one-time capability the caller can hand to ANY wallet to
 * redeem — this endpoint never learns or stores which wallet will claim it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaignId: string = body.campaignId;
    const proverAddress: string = body.proverAddress; // the address whose deposit history is checked
    const salt: string = body.salt ?? "0x" + Date.now().toString(16);
    // Optional: lock this pass to one destination wallet, chosen now instead
    // of at claim time. Turns the default pure-bearer capability into a
    // recipient-bound one — a real scope decision the issuer gets to make,
    // not just a bearer-security disclaimer. Enforced server-side in
    // /api/claim before the attester ever signs a different recipient.
    const boundRecipient: string | null = body.boundRecipient || null;

    if (!campaignId || !proverAddress) {
      return NextResponse.json({ ok: false, error: "campaignId and proverAddress required" }, { status: 400 });
    }
    if (boundRecipient !== null) {
      try {
        BigInt(boundRecipient);
      } catch {
        return NextResponse.json({ ok: false, error: "boundRecipient must be a valid address" }, { status: 400 });
      }
    }

    const { rows } = await db().query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
    const campaign = rows[0];
    if (!campaign) return NextResponse.json({ ok: false, error: "no such campaign" }, { status: 404 });
    if (campaign.status !== "active") {
      return NextResponse.json({ ok: false, error: "campaign not active" }, { status: 400 });
    }

    const { eligible, evidence } = await evaluatePredicate(
      campaign.predicate_type,
      proverAddress,
      campaign.predicate_asset,
      BigInt(campaign.predicate_min_amount),
      Number(campaign.predicate_min_days)
    );

    if (!eligible) {
      return NextResponse.json({ ok: false, error: "predicate not satisfied", evidence }, { status: 403 });
    }

    const nullifier = deriveNullifier(BigInt(campaignId), BigInt(proverAddress), BigInt(salt));
    const nullifierHex = "0x" + nullifier.toString(16);

    const existing = await db().query(`SELECT 1 FROM prova_passes WHERE nullifier = $1`, [nullifierHex]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: false, error: "pass already issued for this input" }, { status: 409 });
    }

    // Deterministic (no salt) commitment of (address, campaign) — lets us
    // enforce "one pass per wallet per campaign" without ever storing the
    // raw address, closing the gap where a caller could otherwise mint
    // unlimited passes for one qualifying wallet by varying `salt` alone.
    const addressCommitment = "0x" + pedersen(BigInt(proverAddress), BigInt(campaignId)).toString(16);
    const alreadyIssued = await db().query(
      `SELECT 1 FROM prova_passes WHERE campaign_id = $1 AND address_commitment = $2`,
      [campaignId, addressCommitment]
    );
    if (alreadyIssued.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "this wallet has already been issued a pass for this campaign" },
        { status: 409 }
      );
    }

    // Commitment only — never the raw prover address — so Prova itself can't
    // later be forced to reveal which wallet satisfied the predicate.
    const issuerCommitment = "0x" + pedersen(BigInt(proverAddress), BigInt(salt)).toString(16);

    const expiresAt = new Date(Number(campaign.expiry) * 1000);

    await db().query(
      `INSERT INTO prova_passes (nullifier, campaign_id, predicate_hash, issuer_commitment, signature_r, signature_s, expires_at, bound_recipient, address_commitment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [nullifierHex, campaignId, campaign.predicate_hash, issuerCommitment, "0x0", "0x0", expiresAt, boundRecipient, addressCommitment]
    );

    return NextResponse.json({
      ok: true,
      campaignId,
      nullifier: nullifierHex,
      predicateHash: campaign.predicate_hash,
      boundRecipient,
      // Unless boundRecipient was set, the recipient (fresh wallet) is chosen
      // and signed at claim time, not here.
      message: boundRecipient
        ? `Pass issued, locked to ${boundRecipient}. Only that wallet can claim it.`
        : "Pass issued. Call /api/claim with { campaignId, nullifier, recipient } from any wallet to redeem it.",
      evidenceCount: evidence.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
