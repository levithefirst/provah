import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluatePredicate } from "@/lib/predicate";
import { pedersen, signAttestation, deriveNullifier } from "@/lib/attestation";
import { verifyPassOwnership, OwnershipVerificationError, issuePassTypedData, type PassDeploymentData } from "@/lib/passChallenge";
import { typedData as starknetTypedData } from "starknet";
import { provider } from "@/lib/starknet";
import { decidePassIssuance } from "@/lib/passDecision";

// Postgres error code for "unique_violation" — see the pg driver docs.
const PG_UNIQUE_VIOLATION = "23505";

function deploymentDataDiagnostics(value: unknown) {
  if (!value || typeof value !== "object") return { present: false, keys: [] as string[] };
  const record = value as Record<string, unknown>;
  return {
    present: true,
    keys: Object.keys(record),
    classHashType: typeof record.classHash,
    saltType: typeof record.salt,
    calldataType: Array.isArray(record.calldata) ? "array" : typeof record.calldata,
    calldataLength: Array.isArray(record.calldata) ? record.calldata.length : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaignId: string = body.campaignId;
    const proverAddress: string = body.proverAddress;
    const signature: unknown = body.signature;
    const salt: string = body.salt ?? "0x" + Date.now().toString(16);
    const boundRecipient: string | null = body.boundRecipient || null;
    const deploymentData: PassDeploymentData | null = body.deploymentData ?? null;

    if (!campaignId || !proverAddress) {
      return NextResponse.json({ ok: false, error: "campaignId and proverAddress required" }, { status: 400 });
    }
    if (signature === undefined || signature === null) {
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

    // Reject malformed deployment data as an ownership-proof failure rather
    // than letting undefined values reach calculateContractAddressFromHash
    // and turn into a generic 500. This is especially useful with wallets
    // that expose wallet_deploymentData through different adapter layers.
    if (deploymentData !== null) {
      const d = deploymentData as Partial<PassDeploymentData>;
      if (
        typeof d.classHash !== "string" ||
        typeof d.salt !== "string" ||
        !Array.isArray(d.calldata) ||
        d.calldata.some((felt) => typeof felt !== "string")
      ) {
        const diagnostics = deploymentDataDiagnostics(deploymentData);
        console.error("[/api/pass] malformed deploymentData:", {
          proverAddress,
          campaignId,
          ...diagnostics,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_ownership_signature",
            stage: "deploy_commit",
            detail: "deploymentData must contain string classHash, string salt, and string[] calldata",
          },
          { status: 401 }
        );
      }
    }

    try {
      await verifyPassOwnership(provider(), campaignId, proverAddress, signature, deploymentData);
    } catch (err) {
      const stage = err instanceof OwnershipVerificationError ? err.stage : "unknown";
      const detail = err instanceof Error ? err.message : String(err);
      let msgHash = "unavailable";
      try {
        msgHash = starknetTypedData.getMessageHash(issuePassTypedData(campaignId), proverAddress);
      } catch {
        // The ownership verifier reports typed-data failures separately.
      }
      console.error("[/api/pass] ownership verification failed:", {
        proverAddress,
        campaignId,
        stage,
        detail,
        msgHash,
        signatureLength: Array.isArray(signature) ? signature.length : typeof signature,
        deploymentData: deploymentDataDiagnostics(deploymentData),
      });
      return NextResponse.json(
        { ok: false, error: "invalid_ownership_signature", stage, detail },
        { status: 401 }
      );
    }

    const { rows } = await db().query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
    const campaign = rows[0];

    const addressCommitment = campaign
      ? "0x" + pedersen(BigInt(proverAddress), BigInt(campaignId)).toString(16)
      : null;
    const nullifier = deriveNullifier(BigInt(campaignId), BigInt(proverAddress), BigInt(salt));
    const nullifierHex = "0x" + nullifier.toString(16);

    const [existingByNullifier, existingByWallet] = campaign
      ? await Promise.all([
          db().query(`SELECT 1 FROM prova_passes WHERE nullifier = $1`, [nullifierHex]),
          db().query(`SELECT 1 FROM prova_passes WHERE campaign_id = $1 AND address_commitment = $2`, [
            campaignId,
            addressCommitment,
          ]),
        ])
      : [null, null];

    const decision = decidePassIssuance(
      {
        campaignExists: !!campaign,
        campaignStatus: campaign?.status ?? null,
        campaignExpirySec: campaign ? Number(campaign.expiry) : null,
        nullifierAlreadyUsed: (existingByNullifier?.rows.length ?? 0) > 0,
        alreadyIssuedForWallet: (existingByWallet?.rows.length ?? 0) > 0,
      },
      Math.floor(Date.now() / 1000)
    );
    if (!decision.ok) {
      if (decision.status === 409) {
        return NextResponse.json(
          { ok: false, error: "This wallet already has a pass for this campaign — connect a new empty wallet" },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
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

    const issuerCommitment = "0x" + pedersen(BigInt(proverAddress), BigInt(salt)).toString(16);
    const expiresAt = new Date(Number(campaign.expiry) * 1000);

    try {
      await db().query(
        `INSERT INTO prova_passes (nullifier, campaign_id, predicate_hash, issuer_commitment, signature_r, signature_s, expires_at, bound_recipient, address_commitment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [nullifierHex, campaignId, campaign.predicate_hash, issuerCommitment, "0x0", "0x0", expiresAt, boundRecipient, addressCommitment]
      );
    } catch (err) {
      const pgCode = (err as { code?: string } | null)?.code;
      if (pgCode === PG_UNIQUE_VIOLATION) {
        return NextResponse.json(
          { ok: false, error: "This wallet already has a pass for this campaign — connect a new empty wallet" },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      ok: true,
      campaignId,
      nullifier: nullifierHex,
      predicateHash: campaign.predicate_hash,
      boundRecipient,
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
