import { NextRequest, NextResponse } from "next/server";
import { cairo, hash, num } from "starknet";
import { operatorAccount, provider, withOperatorLock } from "@/lib/starknet";
import { PROVA_PASS_ABI } from "@/lib/provaPassAbi";
import { PROVA_PASS_CONTRACT_ADDRESS, requireAdmin } from "@/lib/config";
import { pedersen } from "@/lib/attestation";
import { db } from "@/lib/db";
import { Contract } from "starknet";

/**
 * One-shot: creates a demo campaign on the deployed ProvaPass contract and
 * records it in the public DB. Triggered the same way as /api/admin/deploy.
 */
export async function GET(req: NextRequest) {
  try {
    requireAdmin(req.nextUrl.searchParams.get("token"));
    const sp = req.nextUrl.searchParams;

    const name = sp.get("name") ?? "STRK Loyalty Drop";
    const description =
      sp.get("description") ??
      "Held >= X STRK for >= N days in the private pool? Claim from any wallet.";
    const predicateType = sp.get("predicateType") ?? "held_since"; // held_since | balance_threshold | deposit_count
    const claimKind = sp.get("claimKind") ?? "capability"; // capability | allowlist | reward_token
    const predicateAsset = sp.get("asset") ?? "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
    const minAmount = BigInt(sp.get("minAmount") ?? "1000000000000000000"); // 1 STRK default (or min count, for deposit_count)
    const minDays = Number(sp.get("minDays") ?? "7");
    const rewardToken = sp.get("rewardToken") ?? predicateAsset;
    const rewardAmount = BigInt(sp.get("rewardAmount") ?? "0");
    const expiryDays = Number(sp.get("expiryDays") ?? "90");

    if (!PROVA_PASS_CONTRACT_ADDRESS) throw new Error("PROVA_PASS_CONTRACT_ADDRESS not configured");

    const campaignId = "0x" + hash.starknetKeccak(name + Date.now()).toString(16);
    const predicateHash =
      "0x" +
      pedersen(
        pedersen(pedersen(BigInt(num.toHex(predicateAsset)), minAmount), BigInt(minDays)),
        BigInt(num.toHex(hash.starknetKeccak(predicateType)))
      ).toString(16);
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 86400;

    const account = operatorAccount();
    const contract = new Contract({ abi: PROVA_PASS_ABI, address: PROVA_PASS_CONTRACT_ADDRESS, providerOrAccount: account });

    const call = contract.populate("create_campaign", [
      campaignId,
      predicateHash,
      expiry,
      rewardToken,
      cairo.uint256(rewardAmount),
    ]);
    // Same operator account /api/claim submits transactions from — serialize
    // here too so an admin campaign-creation call can't race a live claim's
    // nonce (see withOperatorLock in src/lib/starknet.ts).
    const { transaction_hash } = await withOperatorLock(() => account.execute(call));
    await provider().waitForTransaction(transaction_hash);

    await db().query(
      `INSERT INTO campaigns (id, name, description, predicate_type, predicate_asset, predicate_min_amount, predicate_min_days, predicate_hash, reward_token, reward_amount, expiry, contract_address, creator_address, create_tx_hash, claim_kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        campaignId,
        name,
        description,
        predicateType,
        predicateAsset,
        minAmount.toString(),
        minDays,
        predicateHash,
        rewardToken,
        rewardAmount.toString(),
        expiry,
        PROVA_PASS_CONTRACT_ADDRESS,
        account.address,
        transaction_hash,
        claimKind,
      ]
    );
    await db().query(`INSERT INTO mainnet_activity_log (kind, tx_hash, detail) VALUES ($1,$2,$3)`, [
      "create_campaign",
      transaction_hash,
      JSON.stringify({ campaignId }),
    ]);

    return NextResponse.json({ ok: true, campaignId, txHash: transaction_hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
