import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await db().query(
      `SELECT id, name, description, predicate_type, predicate_asset, predicate_min_amount, predicate_min_days,
              reward_token, reward_amount, expiry, contract_address, status, create_tx_hash, claim_kind, created_at
       FROM campaigns ORDER BY created_at DESC`
    );
    return NextResponse.json({ campaigns: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ campaigns: [], error: message }, { status: 500 });
  }
}
