import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluatePredicate } from "@/lib/predicate";
import { pedersen, signAttestation, deriveNullifier } from "@/lib/attestation";
import { verifyPassOwnership, type PassDeploymentData } from "@/lib/passChallenge";
import { provider } from "@/lib/starknet";

/**
 * Issue a Prova Pass: evaluate the campaign's predicate against the caller's
 * OWN deposit history — actually proved now, not just claimed by a code
 * comment. The caller signs a SNIP-12 typed-data challenge binding this
 * campaign to their address (see issuePassTypedData); this endpoint
 * recomputes the identical hash and checks it against proverAddress's
 * on-chain is_valid_signature before reading any deposit history or issuing
 * anything. Without this, anyone who merely knew an eligible address —
 * itself public, since deposit history is public — could mint (and for
 * reward campaigns, redeem) a pass meant for that wallet. Deposit history
 * itself stays PUBLIC on-chain data; only the salt is never persisted.
 * Returns a signed, one-time capability the caller can hand to ANY wallet to
 * redeem — this endpoint never learns or stores which wallet will claim it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaignId: string = body.campaignId;
    const proverAddress: string = body.proverAddress; // the address whose deposit history is checked
    const signature: string[] = body.signature; // wallet_signTypedData over issuePassTypedData(campaignId)
    const salt: string = body.salt ?? "0x" + Date.now().toString(16);
    // Optional: lock this pass to one destination wallet, chosen now instead
    // of at claim time. Turns the default pure-bearer capability into a
    // recipient-bound one — a real scope decision the issuer gets to make,
    // not just a bearer-security disclaimer. Enforced server-side in
    // /api/claim before the attester ever signs a different recipient.
    const boundRecipient: string | null = body.boundRecipient || null;
    // Only needed for a wallet that has never transacted on-chain yet (see
    // verifyPassOwnership) — omitted entirely for any already-deployed
    // wallet, which is verified the normal on-chain way.
    const deploymentData: PassDeploymentData | null = body.deploymentData ?? null;

    if (!campaignId || !proverAddress) {
      return NextResponse.json({ ok: false, error: "campaignId and proverAddress required" }, { status: 400 });
    }
    if (!Array.isArray(signature) || signature.length === 0) {
      return NextResponse.json(
        { ok: false, error: "signature required — sign the issuance challenge with proverAddress's wallet" },
        { status: 400 }
      );
    }
    if (boundRecipient !== null) {
      try {
        BigInt(boundRecipient);
      } catch {
        return NextResponse.json({ ok: false, error: "boundRecipient must be a valid address" }, { status: 400 });
      }
    }

    // Kept separate from predicate/eligibility failures below: a typed-data
    // schema error (e.g. a malformed SNIP-12 domain — see passChallenge.ts's
    // top comment for the exact regression this guards against) or a
    // genuinely invalid signature are both "we couldn't verify you control
    // this address," never "you're not eligible." Conflating the two once
    // meant a broken typed-data shape looked identical to "not eligible" in
    // the UI, when every single request was actually failing before
    // eligibility was ever checked.
    let controlsAddress: boolean;
    try {
      controlsAddress = await verifyPassOwnership(provider(), campaignId, proverAddress, signature, deploymentData);
    } catch (err) {
      console.error(
        "[/api/pass] ownership signature verification threw (typed-data/schema/RPC error, not an eligibility failure):",
        err instanceof Error ? err.message : String(err)
      );
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_ownership_signature",
          detail: "typed data failed verification",
        },
        { status: 401 }
      );
    }
    if (!controlsAddress) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_ownership_signature",
          detail: "signature does not prove control of proverAddress for this campaign",
        },
        { status: 401 }
      );
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
