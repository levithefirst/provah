import { NextRequest, NextResponse } from "next/server";
import { Contract } from "starknet";
import { db } from "@/lib/db";
import { operatorAccount, provider } from "@/lib/starknet";
import { PROVA_PASS_ABI } from "@/lib/provaPassAbi";
import { PROVA_PASS_CONTRACT_ADDRESS } from "@/lib/config";
import { signAttestation } from "@/lib/attestation";

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
    if (!PROVA_PASS_CONTRACT_ADDRESS) {
      return NextResponse.json({ ok: false, error: "contract not deployed yet" }, { status: 503 });
    }

    const passRow = await db().query(
      `SELECT * FROM prova_passes WHERE nullifier = $1 AND campaign_id = $2`,
      [nullifier, campaignId]
    );
    const pass = passRow.rows[0];
    if (!pass) return NextResponse.json({ ok: false, error: "no such pass" }, { status: 404 });
    if (pass.status !== "issued") {
      return NextResponse.json({ ok: false, error: `pass already ${pass.status}` }, { status: 409 });
    }

    const sig = signAttestation(BigInt(campaignId), BigInt(nullifier), BigInt(recipient));

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
