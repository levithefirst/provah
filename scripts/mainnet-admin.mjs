#!/usr/bin/env node
/**
 * Standalone CLI for one-shot mainnet admin actions, run from GitHub Actions
 * (a runner with real internet access — this repo's own dev sandbox cannot
 * reach Starknet RPC directly; see STATUS.md). Duplicates the minimal logic
 * from src/lib and src/app/api/admin/* rather than importing them, since
 * those use Next.js path aliases and this runs as a plain Node script.
 *
 * Usage: node scripts/mainnet-admin.mjs <deploy|create-campaign|claim> [...args]
 * Required env: STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY,
 *   PROVA_ATTESTER_PRIVATE_KEY (or PROVA_ATTESTER_PUBLIC_KEY for deploy),
 *   PROVA_PASS_CONTRACT_ADDRESS (for create-campaign / claim)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Account, RpcProvider, CallData, Contract, cairo, hash, ec, constants } from "starknet";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.STARKNET_RPC_URL || "https://rpc.starknet.lava.build:443/rpc/v0_9";
const ACCOUNT_ADDRESS = requireEnv("STARKNET_ACCOUNT_ADDRESS");
const PRIVATE_KEY = requireEnv("STARKNET_PRIVATE_KEY");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

function pedersen(a, b) {
  return BigInt(hash.computePedersenHash(a, b));
}

function provider() {
  return new RpcProvider({ nodeUrl: RPC_URL });
}

function account() {
  return new Account({
    provider: provider(),
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
    cairoVersion: "1",
    chainId: constants.StarknetChainId.SN_MAIN,
  });
}

function attesterPublicKey() {
  if (process.env.PROVA_ATTESTER_PUBLIC_KEY) return process.env.PROVA_ATTESTER_PUBLIC_KEY;
  return ec.starkCurve.getStarkKey(requireEnv("PROVA_ATTESTER_PRIVATE_KEY"));
}

function signAttestation(campaignId, nullifier, recipient) {
  const inner = pedersen(campaignId, nullifier);
  const msgHash = pedersen(inner, recipient);
  const sig = ec.starkCurve.sign(
    msgHash.toString(16).padStart(64, "0"),
    requireEnv("PROVA_ATTESTER_PRIVATE_KEY")
  );
  return { r: "0x" + sig.r.toString(16), s: "0x" + sig.s.toString(16) };
}

async function cmdBalance() {
  const p = provider();
  const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
  const ETH = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
  const nonce = await p.getNonceForAddress(ACCOUNT_ADDRESS).catch((e) => `error: ${trimError(e)}`);
  const strkBal = await p
    .callContract({ contractAddress: STRK, entrypoint: "balanceOf", calldata: [ACCOUNT_ADDRESS] })
    .catch((e) => [`error: ${trimError(e)}`]);
  const ethBal = await p
    .callContract({ contractAddress: ETH, entrypoint: "balanceOf", calldata: [ACCOUNT_ADDRESS] })
    .catch((e) => [`error: ${trimError(e)}`]);
  console.log("rpc:", RPC_URL);
  console.log("account:", ACCOUNT_ADDRESS);
  console.log("nonce:", nonce);
  console.log("STRK balance (low,high):", strkBal[0], strkBal[1]);
  console.log("ETH balance (low,high):", ethBal[0], ethBal[1]);
}

async function cmdDeploy() {
  const sierra = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.sierra.json"), "utf-8"));
  const casm = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.casm.json"), "utf-8"));
  const acc = account();
  const p = provider();

  const chainId = await p.getChainId();
  const specVersion = await p.getSpecVersion();
  console.log("chainId:", chainId, "specVersion:", specVersion);
  if (chainId !== "0x534e5f4d41494e") {
    throw new Error(`refusing to declare: RPC reports chainId ${chainId}, expected mainnet 0x534e5f4d41494e`);
  }

  console.log("Declaring ProvaPass...");
  const declareResult = await acc.declare({ contract: sierra, casm });
  await p.waitForTransaction(declareResult.transaction_hash);
  console.log("declare tx:", declareResult.transaction_hash);
  console.log("class hash:", declareResult.class_hash);

  const constructorCalldata = CallData.compile({
    owner: ACCOUNT_ADDRESS,
    attester_pubkey: attesterPublicKey(),
  });

  console.log("Deploying ProvaPass...");
  const deployResult = await acc.deployContract({ classHash: declareResult.class_hash, constructorCalldata });
  await p.waitForTransaction(deployResult.transaction_hash);
  console.log("deploy tx:", deployResult.transaction_hash);
  console.log("contract address:", deployResult.contract_address);

  console.log("\nSet these:");
  console.log(`PROVA_PASS_CLASS_HASH=${declareResult.class_hash}`);
  console.log(`PROVA_PASS_CONTRACT_ADDRESS=${deployResult.contract_address}`);
}

async function cmdCreateCampaign() {
  const contractAddress = requireEnv("PROVA_PASS_CONTRACT_ADDRESS");
  const [name, asset, minAmount, minDays, rewardToken, rewardAmount, expiryDays] = process.argv.slice(3);

  const abi = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.sierra.json"), "utf-8")).abi;
  const acc = account();
  const p = provider();
  const contract = new Contract({ abi, address: contractAddress, providerOrAccount: acc });

  const campaignId = "0x" + hash.starknetKeccak((name ?? "STRK Loyalty Drop") + Date.now()).toString(16);
  const predicateHash =
    "0x" + pedersen(pedersen(BigInt(asset), BigInt(minAmount)), BigInt(minDays ?? "7")).toString(16);
  const expiry = Math.floor(Date.now() / 1000) + Number(expiryDays ?? "90") * 86400;

  console.log("Creating campaign", campaignId);
  const call = contract.populate("create_campaign", [
    campaignId,
    predicateHash,
    expiry,
    rewardToken ?? asset,
    cairo.uint256(BigInt(rewardAmount ?? "0")),
  ]);
  const { transaction_hash } = await acc.execute(call);
  await p.waitForTransaction(transaction_hash);
  console.log("create_campaign tx:", transaction_hash);
  console.log("campaign_id:", campaignId);
}

async function cmdClaim() {
  const contractAddress = requireEnv("PROVA_PASS_CONTRACT_ADDRESS");
  const [campaignId, nullifier, recipient] = process.argv.slice(3);
  if (!campaignId || !nullifier || !recipient) {
    throw new Error("usage: claim <campaignId> <nullifier> <recipient>");
  }

  const abi = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.sierra.json"), "utf-8")).abi;
  const acc = account();
  const p = provider();
  const contract = new Contract({ abi, address: contractAddress, providerOrAccount: acc });

  const sig = signAttestation(BigInt(campaignId), BigInt(nullifier), BigInt(recipient));
  console.log("Claiming with pass...");
  const call = contract.populate("claim_with_prova_pass", [campaignId, nullifier, recipient, sig.r, sig.s]);
  const { transaction_hash } = await acc.execute(call);
  await p.waitForTransaction(transaction_hash);
  console.log("claim tx:", transaction_hash);
}

const action = process.argv[2];
const handlers = { deploy: cmdDeploy, "create-campaign": cmdCreateCampaign, claim: cmdClaim, balance: cmdBalance };
const handler = handlers[action];
if (!handler) {
  console.error(`Unknown action "${action}". Use one of: ${Object.keys(handlers).join(", ")}`);
  process.exit(1);
}
function trimError(err) {
  // starknet.js's RpcError embeds the full request payload (e.g. the entire
  // Sierra program array for a declare) into .message, which is large enough
  // to blow past CI log line/size limits before the actual error prints. Use
  // the structured .baseError {code, message, data} it exposes instead.
  if (err?.baseError) {
    return `code ${err.baseError.code}: ${err.baseError.message} ${JSON.stringify(err.baseError.data ?? "")}`;
  }
  return String(err?.message ?? err).slice(0, 500);
}

handler().catch((err) => {
  console.error(trimError(err));
  if (!err?.baseError && err?.stack) {
    console.error(err.stack.split("\n").slice(0, 5).join("\n"));
  }
  process.exit(1);
});
