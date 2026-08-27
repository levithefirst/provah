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

/**
 * Standard OpenZeppelin single-signer account (no guardian), confirmed
 * declared on Starknet mainnet via the check-class action. Constructor
 * takes a single `public_key: felt252` and validates plain [r, s]
 * signatures — no Argent-style SignerSignature wrapping needed.
 */
const OZ_ACCOUNT_CLASS_HASH = "0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564";

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

async function cmdDeployAccount() {
  const p = provider();
  const publicKey = ec.starkCurve.getStarkKey(PRIVATE_KEY);
  console.log("derived pubkey:", publicKey);

  const chainId = await p.getChainId();
  if (chainId !== "0x534e5f4d41494e") {
    throw new Error(`refusing to deploy: RPC reports chainId ${chainId}, expected mainnet 0x534e5f4d41494e`);
  }

  const constructorCalldata = CallData.compile({ public_key: publicKey });
  const computedAddress = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    0
  );
  console.log("computed counterfactual address:", computedAddress);
  if (BigInt(computedAddress) !== BigInt(ACCOUNT_ADDRESS)) {
    throw new Error(
      `computed address ${computedAddress} does not match STARKNET_ACCOUNT_ADDRESS ${ACCOUNT_ADDRESS}`
    );
  }

  const acc = account();
  const { transaction_hash, contract_address } = await acc.deployAccount({
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    addressSalt: publicKey,
  });
  await p.waitForTransaction(transaction_hash);
  console.log("deploy_account tx:", transaction_hash);
  console.log("account address:", contract_address);
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

const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH_TOKEN = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

/**
 * balance [address] — defaults to the operating account, but accepts any
 * address so a reward payout's recipient balance can be checked
 * before/after a claim without needing that address's private key at all.
 */
async function cmdBalance() {
  const p = provider();
  const target = process.argv[3] || ACCOUNT_ADDRESS;
  const nonce = await p.getNonceForAddress(target).catch((e) => `error: ${trimError(e)}`);
  const strkBal = await p
    .callContract({ contractAddress: STRK_TOKEN, entrypoint: "balanceOf", calldata: [target] })
    .catch((e) => [`error: ${trimError(e)}`]);
  const ethBal = await p
    .callContract({ contractAddress: ETH_TOKEN, entrypoint: "balanceOf", calldata: [target] })
    .catch((e) => [`error: ${trimError(e)}`]);
  console.log("rpc:", RPC_URL);
  console.log("address:", target);
  console.log("nonce:", nonce);
  console.log("STRK balance (low,high):", strkBal[0], strkBal[1]);
  console.log("ETH balance (low,high):", ethBal[0], ethBal[1]);
}

/**
 * fund-contract <tokenAddress> <amountWei> — transfer real ERC20 value from
 * the operating account to PROVA_PASS_CONTRACT_ADDRESS so the contract can
 * actually pay out reward_amount on claim_with_prova_pass. Additive: no
 * redeploy, uses the IERC20.transfer path already embedded in the deployed
 * contract's claim function.
 */
async function cmdFundContract() {
  const contractAddress = requireEnv("PROVA_PASS_CONTRACT_ADDRESS");
  const [tokenAddress, amountWei] = process.argv.slice(3);
  if (!tokenAddress || !amountWei) {
    throw new Error("usage: fund-contract <tokenAddress> <amountWei>");
  }
  const acc = account();
  const p = provider();
  const call = {
    contractAddress: tokenAddress,
    entrypoint: "transfer",
    calldata: CallData.compile({ recipient: contractAddress, amount: cairo.uint256(BigInt(amountWei)) }),
  };
  console.log(`Funding ProvaPass (${contractAddress}) with ${amountWei} of ${tokenAddress}...`);
  const { transaction_hash } = await acc.execute(call);
  await p.waitForTransaction(transaction_hash);
  console.log("fund-contract tx:", transaction_hash);
}

async function cmdPoolAbi() {
  const p = provider();
  const POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
  const cls = await p.getClassAt(POOL);
  const externals = (cls.abi ?? []).filter(
    (e) => e.type === "function" || e.type === "interface" || e.type === "struct" || e.type === "enum"
  );
  console.log(JSON.stringify(externals, null, 2));
}

/**
 * tx-status <hash> — read-only receipt + event check, for verifying a claimed
 * mainnet transaction (e.g. one supplied by a teammate) before recording it
 * anywhere. Prints status, block, and which contracts/keys emitted events so
 * a pool-touching claim can be confirmed rather than taken on faith.
 */
async function cmdTxStatus() {
  const txHash = process.argv[3];
  if (!txHash) throw new Error("usage: tx-status <hash>");
  const p = provider();
  const receipt = await p.getTransactionReceipt(txHash);
  console.log("finality_status:", receipt.finality_status);
  console.log("execution_status:", receipt.execution_status);
  console.log("block_number:", receipt.block_number);
  console.log("events:");
  for (const ev of receipt.events ?? []) {
    console.log("  from_address:", ev.from_address);
    console.log("  keys:", JSON.stringify(ev.keys));
    console.log("  data:", JSON.stringify(ev.data));
    console.log("  ---");
  }
}

const POOL_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/**
 * Attempt a real STRK20 pool-touching mainnet transaction: register a
 * viewing key. Per the hackathon's docs/MAINNET-DAY-0.md, this is one of
 * the two actions ("registering a viewing key, and shielding") documented
 * as needing no proving service at all — a plain call to the pool's
 * external apply_actions(actions, screening) with a ServerAction that
 * needs no ZK proof, submitted directly by an ordinary account. Deposits
 * are the other such action, but additionally require a compliance
 * provider's screening signature over the deposit, which we have no way
 * to obtain — see STATUS.md.
 *
 * The pubkey derivation follows the doc's own snippet: sign a fixed
 * domain message, Poseidon-fold the signature, reduce into curve order.
 * The resulting scalar's own EC public key is registered. The optional
 * encrypted-backup field (enc_private_key: EncPrivateKey{auditor_public_key,
 * ephemeral_pubkey, enc_private_key}) has no specified encoding in the
 * docs; we submit explicit "no backup provided" zero values rather than
 * fabricate a bogus encryption scheme.
 */
async function cmdPoolRegisterViewingKey({ dryRun }) {
  const p = provider();
  const acc = account();

  const chainId = await p.getChainId();
  if (chainId !== "0x534e5f4d41494e") {
    throw new Error(`refusing to submit: RPC reports chainId ${chainId}, expected mainnet`);
  }

  const messageHash = hash.starknetKeccak(`${chainId}:${POOL_ADDRESS}`);
  const sig = ec.starkCurve.sign(BigInt(messageHash).toString(16).padStart(64, "0"), PRIVATE_KEY);
  const folded = BigInt(hash.computePoseidonHashOnElements([sig.r.toString(), sig.s.toString()]));
  const reduced = folded % ec.starkCurve.CURVE.n;
  const publicKey = ec.starkCurve.getStarkKey(reduced.toString(16).padStart(64, "0"));

  console.log("derived viewing pubkey:", publicKey);

  // starknet.js's ABI-driven CairoCustomEnum-inside-Span serialization kept
  // failing ("Missing parameter for type core::felt252") on this ABI shape,
  // so the calldata is built by hand instead — Cairo 1 encodes a custom
  // enum as [variant_index, ...variant fields], a Span<T> as [len, ...T],
  // and Option::None as [1] (core::option::Option's variant order is
  // Some=0, None=1, matching starknet.js's own CairoOptionVariant).
  // ServerAction variant order, from the pool's own ABI: WriteOnce(0),
  // Append(1), TransferFrom(2), TransferTo(3), EmitViewingKeySet(4), ...
  const EMIT_VIEWING_KEY_SET_VARIANT = 4;
  const calldata = [
    "0x1", // actions: Span<ServerAction>, length 1
    EMIT_VIEWING_KEY_SET_VARIANT.toString(),
    ACCOUNT_ADDRESS, // ViewingKeySet.user_addr
    publicKey, // ViewingKeySet.public_key
    // ViewingKeySet.enc_private_key is a 3-felt EncPrivateKey struct
    // {auditor_public_key, ephemeral_pubkey, enc_private_key} — no backup
    // provided, so all zero.
    "0x0",
    "0x0",
    "0x0",
    "0x1", // screening: Option<ScreeningAttestation>::None
  ];
  const call = { contractAddress: POOL_ADDRESS, entrypoint: "apply_actions", calldata };

  console.log("Estimating fee (dry run, no gas spent if this throws)...");
  const estimate = await acc.estimateInvokeFee(call);
  console.log("fee estimate succeeded:", estimate.overall_fee?.toString?.() ?? estimate.suggestedMaxFee?.toString?.());

  if (dryRun) {
    console.log("Dry run only (arg1=dry-run) — not submitting. Re-run with arg1=submit to send it for real.");
    return;
  }

  console.log("Submitting apply_actions(EmitViewingKeySet) to the live STRK20 pool...");
  const { transaction_hash } = await acc.execute(call);
  await p.waitForTransaction(transaction_hash);
  console.log("pool register tx:", transaction_hash);
}

async function cmdCheckClass() {
  const p = provider();
  const candidates = process.argv.slice(3).filter(Boolean);
  for (const classHash of candidates) {
    const result = await p
      .getClass(classHash)
      .then((cls) => {
        const ctor = (cls.abi ?? []).find(
          (e) => e.type === "constructor" || e.type === "function" && e.name === "constructor"
        );
        return "DECLARED constructor=" + JSON.stringify(ctor?.inputs ?? ctor ?? "not in top-level abi");
      })
      .catch((e) => `not found: ${trimError(e)}`);
    console.log(classHash, "->", result);
  }
}

async function cmdGetCampaign() {
  const contractAddress = requireEnv("PROVA_PASS_CONTRACT_ADDRESS");
  const campaignId = process.argv[3];
  if (!campaignId) throw new Error("usage: get-campaign <campaignId>");
  const p = provider();
  const abi = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.sierra.json"), "utf-8")).abi;
  const contract = new Contract({ abi, address: contractAddress, providerOrAccount: p });
  const result = await contract.call("get_campaign", [campaignId]);
  console.log("get_campaign result:", JSON.stringify(result, (_, v) => (typeof v === "bigint" ? "0x" + v.toString(16) : v)));
}

async function cmdCheckOwner() {
  const p = provider();
  const derivedPubkey = ec.starkCurve.getStarkKey(PRIVATE_KEY);
  console.log("derived pubkey from STARKNET_PRIVATE_KEY:", derivedPubkey);
  for (const entrypoint of ["get_owner", "getOwner", "owner", "get_owners", "getGuardian", "get_guardian"]) {
    const result = await p
      .callContract({ contractAddress: ACCOUNT_ADDRESS, entrypoint, calldata: [] })
      .catch((e) => [`error: ${trimError(e)}`]);
    console.log(entrypoint, "->", JSON.stringify(result));
  }
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
  const [name, asset, minAmount, minDays, rewardToken, rewardAmount, expiryDays, predicateType] =
    process.argv.slice(3);

  const abi = JSON.parse(readFileSync(join(__dirname, "../src/contracts/prova_pass.sierra.json"), "utf-8")).abi;
  const acc = account();
  const p = provider();
  const contract = new Contract({ abi, address: contractAddress, providerOrAccount: acc });

  const campaignId = "0x" + hash.starknetKeccak((name ?? "STRK Loyalty Drop") + Date.now()).toString(16);
  const predicateHash =
    "0x" +
    pedersen(
      pedersen(pedersen(BigInt(asset), BigInt(minAmount)), BigInt(minDays ?? "7")),
      BigInt(hash.starknetKeccak(predicateType ?? "held_since"))
    ).toString(16);
  const expiry = Math.floor(Date.now() / 1000) + Number(expiryDays ?? "90") * 86400;

  console.log("Creating campaign", campaignId, "type:", predicateType ?? "held_since");
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
  console.log("predicate_hash:", predicateHash);
  console.log("expiry (unix seconds):", expiry);
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
const handlers = {
  "deploy-account": cmdDeployAccount,
  deploy: cmdDeploy,
  "create-campaign": cmdCreateCampaign,
  claim: cmdClaim,
  balance: cmdBalance,
  "check-owner": cmdCheckOwner,
  "check-class": cmdCheckClass,
  "get-campaign": cmdGetCampaign,
  "pool-abi": cmdPoolAbi,
  "tx-status": cmdTxStatus,
  "pool-register": () => cmdPoolRegisterViewingKey({ dryRun: process.argv[3] !== "submit" }),
  "fund-contract": cmdFundContract,
};
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
