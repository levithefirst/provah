import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { rows } = await db().query(
    `SELECT id, name, description, predicate_asset, predicate_min_amount, predicate_min_days,
            reward_token, reward_amount, expiry, contract_address, status, create_tx_hash, created_at
     FROM campaigns ORDER BY created_at DESC`
  );
  return NextResponse.json({ campaigns: rows });
}
