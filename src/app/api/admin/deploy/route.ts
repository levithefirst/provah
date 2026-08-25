import { NextRequest, NextResponse } from "next/server";
import { CallData } from "starknet";
import { operatorAccount, provider } from "@/lib/starknet";
import { PROVA_PASS_SIERRA, PROVA_PASS_CASM } from "@/lib/provaPassAbi";
import { requireAdmin, STARKNET_ACCOUNT_ADDRESS } from "@/lib/config";
import { attesterPublicKey } from "@/lib/attestation";
import { db } from "@/lib/db";

/**
 * One-shot: declare + deploy the ProvaPass contract to Starknet mainnet.
 * Triggered remotely (this repo's own dev sandbox cannot reach Starknet RPC
 * directly — see STATUS.md) via GET with a shared admin token, e.g. through
 * the Vercel MCP's web_fetch_vercel_url tool.
 */
export async function GET(req: NextRequest) {
  try {
    requireAdmin(req.nextUrl.searchParams.get("token"));

    const account = operatorAccount();
    const attester = attesterPublicKey();

    const declareResult = await account.declare({
      contract: PROVA_PASS_SIERRA,
      casm: PROVA_PASS_CASM,
    });
    await provider().waitForTransaction(declareResult.transaction_hash);

    const classHash = declareResult.class_hash;
    const constructorCalldata = CallData.compile({
      owner: STARKNET_ACCOUNT_ADDRESS,
      attester_pubkey: attester,
    });

    const deployResult = await account.deployContract({
      classHash,
      constructorCalldata,
    });
    await provider().waitForTransaction(deployResult.transaction_hash);

    await db().query(
      `INSERT INTO mainnet_activity_log (kind, tx_hash, detail) VALUES ($1,$2,$3), ($4,$5,$6)`,
      [
        "declare",
        declareResult.transaction_hash,
        JSON.stringify({ class_hash: classHash }),
        "deploy",
        deployResult.transaction_hash,
        JSON.stringify({ contract_address: deployResult.contract_address, class_hash: classHash }),
      ]
    );

    return NextResponse.json({
      ok: true,
      classHash,
      contractAddress: deployResult.contract_address,
      declareTx: declareResult.transaction_hash,
      deployTx: deployResult.transaction_hash,
      note: "Set PROVA_PASS_CONTRACT_ADDRESS and PROVA_PASS_CLASS_HASH env vars to these values.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
