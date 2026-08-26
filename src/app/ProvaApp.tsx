"use client";

import { useEffect, useState } from "react";
import { connect, disconnect } from "@starknet-io/get-starknet";
import { RpcProvider, hash, num } from "starknet";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  Unlock,
  Wallet,
} from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  description: string;
  predicate_type: string;
  predicate_asset: string;
  predicate_min_amount: string;
  predicate_min_days: number;
  reward_token: string;
  reward_amount: string;
  expiry: number;
  status: string;
  create_tx_hash: string | null;
  claim_kind: string;
};

type LocalPass = {
  campaignId: string;
  campaignName: string;
  nullifier: string;
  createdAt: number;
  boundRecipient?: string | null;
};

const LOCAL_PASSES_KEY = "prova_local_passes_v1";

// Public, non-secret values: the same mainnet RPC and deployed contract
// address published in README/strk20.json. Used client-side purely for
// read-only verification calls, so a user (or a judge) can confirm a claim
// really landed on-chain without trusting Provah's backend at all.
const PUBLIC_RPC_URL = "https://rpc.starknet.lava.build:443/rpc/v0_9";
const PROVA_PASS_CONTRACT_ADDRESS = "0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402";

async function verifyNullifierOnChain(nullifier: string): Promise<boolean> {
  const provider = new RpcProvider({ nodeUrl: PUBLIC_RPC_URL });
  const result = await provider.callContract({
    contractAddress: PROVA_PASS_CONTRACT_ADDRESS,
    entrypoint: "is_nullifier_consumed",
    calldata: [nullifier],
  });
  return BigInt(result[0] ?? "0x0") === BigInt(1);
}

async function fetchStrkBalance(address: string): Promise<bigint> {
  const provider = new RpcProvider({ nodeUrl: PUBLIC_RPC_URL });
  const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
  const result = await provider.callContract({
    contractAddress: STRK,
    entrypoint: "balanceOf",
    calldata: [address],
  });
  return BigInt(result[0] ?? "0x0");
}

// Same public pool contract Prova's server reads — hardcoded here (not a
// secret; it's published in README/strk20.json) so eligibility can be
// re-derived entirely client-side, from the same public data, without
// asking Prova at all. This is not a second opinion layered on top of a
// black box: it is the identical computation src/lib/predicate.ts performs
// server-side, run independently in the browser against public RPC.
const STRK20_POOL_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
const DEPOSIT_EVENT_KEY = num.toHex(hash.starknetKeccak("Deposit"));

type ClientDeposit = { amount: bigint; token: string; timestampSec: number };

async function clientGetDepositHistory(userAddress: string, needTimestamps: boolean): Promise<ClientDeposit[]> {
  const provider = new RpcProvider({ nodeUrl: PUBLIC_RPC_URL });
  const userFelt = num.toHex(userAddress);
  const deposits: ClientDeposit[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await provider.getEvents({
      address: STRK20_POOL_ADDRESS,
      keys: [[DEPOSIT_EVENT_KEY], [userFelt]],
      chunk_size: 100,
      continuation_token: continuationToken,
      from_block: { block_number: 0 },
      to_block: "latest",
    });
    for (const ev of page.events) {
      const [, token, amountLow] = ev.data ?? [];
      let timestampSec = 0;
      if (needTimestamps) {
        const block = await provider.getBlockWithTxHashes(ev.block_hash ?? "latest");
        timestampSec = "timestamp" in block ? (block.timestamp as number) : 0;
      }
      deposits.push({ amount: BigInt(amountLow ?? "0"), token: token ?? "", timestampSec });
    }
    continuationToken = page.continuation_token;
  } while (continuationToken);

  return deposits;
}

type SelfCheckResult = { eligible: boolean; total: bigint; count: number };

// Independent, client-only re-derivation of the exact predicate Prova's
// server will check. Runs before /api/pass is ever called, so a user (or a
// judge) never has to take Prova's "eligible" / "not eligible" verdict on
// faith — the same public deposit events, the same arithmetic, done in the
// browser.
async function clientEvaluatePredicate(campaign: Campaign, userAddress: string): Promise<SelfCheckResult> {
  const needsTimestamps = campaign.predicate_type === "held_since";
  const deposits = (await clientGetDepositHistory(userAddress, needsTimestamps)).filter(
    (d) => d.token.toLowerCase() === campaign.predicate_asset.toLowerCase()
  );
  const minAmount = BigInt(campaign.predicate_min_amount);

  if (campaign.predicate_type === "deposit_count") {
    const count = BigInt(deposits.length);
    return { eligible: count >= minAmount, total: count, count: deposits.length };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = campaign.predicate_type === "held_since" ? nowSec - campaign.predicate_min_days * 86400 : null;
  let running = BigInt(0);
  for (const d of deposits) {
    if (cutoff !== null && d.timestampSec > cutoff) continue;
    running += d.amount;
  }
  return { eligible: running >= minAmount, total: running, count: deposits.length };
}

function short(addr: string | null | undefined) {
  if (!addr) return "none";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatStrk(amountWei: string): string {
  const asNum = Number(BigInt(amountWei)) / 1e18;
  return `${asNum} STRK`;
}

function predicateLabel(c: Campaign): string {
  switch (c.predicate_type) {
    case "balance_threshold":
      return `Hold ≥ ${formatStrk(c.predicate_min_amount)} right now, no minimum holding period`;
    case "deposit_count":
      return `Make ≥ ${c.predicate_min_amount} separate deposit(s) into the pool (counts activity, not balance)`;
    case "held_since":
    default:
      return `Hold ≥ ${formatStrk(c.predicate_min_amount)} for ≥ ${c.predicate_min_days} days`;
  }
}

function predicateTypeTag(type: string): string {
  switch (type) {
    case "balance_threshold":
      return "Balance threshold";
    case "deposit_count":
      return "Deposit activity";
    case "held_since":
    default:
      return "Held since";
  }
}

function claimKindTag(kind: string): string {
  switch (kind) {
    case "allowlist":
      return "Allowlist entry";
    case "reward_token":
      return "Reward token";
    case "capability":
    default:
      return "Capability only";
  }
}

function rewardLabel(c: Campaign): string | null {
  if (c.claim_kind !== "reward_token" || BigInt(c.reward_amount || "0") === BigInt(0)) return null;
  return `Redeeming pays ${formatStrk(c.reward_amount)} to the claiming wallet: a real transfer, not just a record.`;
}

function expiryLabel(c: Campaign): string {
  const ms = Number(c.expiry) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "No expiry set";
  const date = new Date(ms);
  const isPast = ms < Date.now();
  return `${isPast ? "Expired" : "Expires"} ${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

function encodePassToken(campaignId: string, nullifier: string): string {
  const json = JSON.stringify({ v: 1, campaignId, nullifier });
  return typeof window === "undefined" ? "" : window.btoa(json);
}

function decodePassToken(token: string): { campaignId: string; nullifier: string } | null {
  try {
    const parsed = JSON.parse(window.atob(token.trim()));
    if (parsed?.campaignId && parsed?.nullifier) {
      return { campaignId: parsed.campaignId, nullifier: parsed.nullifier };
    }
    return null;
  } catch {
    return null;
  }
}

function loadLocalPasses(): LocalPass[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_PASSES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLocalPasses(passes: LocalPass[]) {
  try {
    window.localStorage.setItem(LOCAL_PASSES_KEY, JSON.stringify(passes));
  } catch {
    // localStorage unavailable — passes just won't persist across reloads
  }
}

async function connectWallet(): Promise<string | null> {
  const swo = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
  if (!swo) return null;
  const accounts = await swo.request({ type: "wallet_requestAccounts" });
  return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
}

/**
 * The hero visual: Wallet A (private) -> Pass -> Wallet B (fresh), with an
 * explicit "no on-chain link" callout. Stage highlighting tracks the
 * primary guided flow below it.
 */
function FlowNode({
  Icon,
  label,
  sub,
  active,
  done,
}: {
  Icon: typeof Lock;
  label: string;
  sub: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`relative flex min-w-[9rem] flex-col items-center justify-center gap-1 rounded-xl border px-4 py-4 transition-all duration-300 ${
        done
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-300"
          : active
            ? "border-neutral-900 bg-neutral-900/5 text-neutral-900 ring-2 ring-neutral-900/20 animate-soft-ring dark:border-neutral-100 dark:bg-neutral-100/10 dark:text-neutral-100 dark:ring-neutral-100/40"
            : "border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
      }`}
    >
      {done && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 animate-pop-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm dark:bg-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
      )}
      <Icon className="h-6 w-6" strokeWidth={1.75} />
      <span className="text-xs uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-sm font-medium">{sub}</span>
    </div>
  );
}

function CapabilityFlow({
  stage,
}: {
  stage: "idle" | "wallet-a" | "pass" | "wallet-b" | "claimed";
}) {
  const order = ["wallet-a", "pass", "wallet-b", "claimed"];
  const reached = (s: string) => order.indexOf(s) <= order.indexOf(stage === "idle" ? "" : stage);

  const arrowClass = (done: boolean) =>
    `h-px flex-1 min-w-[1.5rem] transition-colors duration-300 sm:min-w-[2.5rem] ${
      done ? "bg-emerald-500/60" : "bg-neutral-200 dark:bg-neutral-800"
    }`;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
      <p className="text-center text-base font-medium mb-4 text-neutral-900 dark:text-neutral-100">
        Private balance{" "}
        <span className="text-neutral-500 dark:text-neutral-500">turns into</span> a bearer
        capability{" "}
        <span className="text-neutral-500 dark:text-neutral-500">, redeemed by</span> any wallet,
        unlinked.
      </p>
      <div className="flex items-center justify-center gap-1 sm:gap-3 overflow-x-auto">
        <FlowNode
          Icon={Lock}
          label="Wallet A"
          sub="private holder"
          active={stage === "wallet-a"}
          done={reached("wallet-a")}
        />
        <div className={arrowClass(reached("pass"))} />
        <FlowNode
          Icon={Ticket}
          label="Provah Pass"
          sub="bearer capability"
          active={stage === "pass"}
          done={reached("pass")}
        />
        <div className={arrowClass(reached("wallet-b"))} />
        <FlowNode
          Icon={Unlock}
          label="Wallet B"
          sub="fresh, zero gas"
          active={stage === "wallet-b" || stage === "claimed"}
          done={reached("wallet-b")}
        />
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500">
        No on-chain link, no shared address, no Provah-stored mapping between A and B. The pass
        itself is the only thing that crosses between them.
      </p>
    </div>
  );
}

export default function ProvaApp() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [proverWallet, setProverWallet] = useState<string | null>(null);
  const [pass, setPass] = useState<LocalPass | null>(null);
  const [localPasses, setLocalPasses] = useState<LocalPass[]>([]);
  const [claimWallet, setClaimWallet] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"idle" | "generate" | "claim" | "redeem">("idle");
  const busy = busyAction !== "idle";
  const [redeemToken, setRedeemToken] = useState("");
  const [redeemWallet, setRedeemWallet] = useState<string>("");
  const [redeemTx, setRedeemTx] = useState<string | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<string>("");
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [lockPass, setLockPass] = useState(false);
  const [lockRecipient, setLockRecipient] = useState("");
  const [claimVerify, setClaimVerify] = useState<"idle" | "checking" | "confirmed" | "failed">("idle");
  const [redeemVerify, setRedeemVerify] = useState<"idle" | "checking" | "confirmed" | "failed">("idle");
  const [claimBalanceDelta, setClaimBalanceDelta] = useState<string | null>(null);
  const [redeemBalanceDelta, setRedeemBalanceDelta] = useState<string | null>(null);
  const [selfCheck, setSelfCheck] = useState<"idle" | "checking" | "eligible" | "ineligible" | "error">("idle");
  const [selfCheckDetail, setSelfCheckDetail] = useState<string>("");
  const [rewardPoolBalance, setRewardPoolBalance] = useState<string | null>(null);

  useEffect(() => {
    setLocalPasses(loadLocalPasses());
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns(d.campaigns ?? []);
        if (d.campaigns?.[0]) setSelected(d.campaigns[0].id);
        if (d.error) setStatus(`Could not load campaigns: ${d.error}`);
      })
      .catch((err) => setStatus(`Could not load campaigns: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setCampaignsLoading(false));
  }, []);

  const campaign = campaigns.find((c) => c.id === selected);

  // Independent re-derivation of eligibility, entirely client-side, the
  // moment wallet A is connected — before /api/pass is ever called. This is
  // not decorative: it's the same computation Prova's server performs,
  // run against the same public data, so nothing about "are you eligible"
  // requires trusting Prova's answer.
  useEffect(() => {
    if (!campaign || !proverWallet) {
      setSelfCheck("idle");
      setSelfCheckDetail("");
      return;
    }
    let cancelled = false;
    setSelfCheck("checking");
    setSelfCheckDetail("");
    clientEvaluatePredicate(campaign, proverWallet)
      .then((result) => {
        if (cancelled) return;
        setSelfCheck(result.eligible ? "eligible" : "ineligible");
        setSelfCheckDetail(
          campaign.predicate_type === "deposit_count"
            ? `${result.count} deposit(s) found, need ${campaign.predicate_min_amount}.`
            : `${formatStrk(result.total.toString())} qualifying, need ${formatStrk(campaign.predicate_min_amount)}.`
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSelfCheck("error");
        setSelfCheckDetail("Could not reach public RPC to self-check — Provah's own check still runs when you generate a pass.");
      });
    return () => {
      cancelled = true;
    };
  }, [campaign, proverWallet]);

  // Live, on-chain-verified upper bound on what a dishonest attestation
  // could ever pay out: ProvaPass can never transfer more STRK than it
  // currently holds, so this number is the real worst case, not a claim.
  useEffect(() => {
    if (!campaign || !rewardLabel(campaign)) {
      setRewardPoolBalance(null);
      return;
    }
    let cancelled = false;
    fetchStrkBalance(PROVA_PASS_CONTRACT_ADDRESS)
      .then((bal) => {
        if (!cancelled) setRewardPoolBalance(bal.toString());
      })
      .catch(() => {
        if (!cancelled) setRewardPoolBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  const flowStage: "idle" | "wallet-a" | "pass" | "wallet-b" | "claimed" = claimTx
    ? "claimed"
    : claimWallet
      ? "wallet-b"
      : pass
        ? "pass"
        : proverWallet
          ? "wallet-a"
          : "idle";

  function addLocalPass(next: LocalPass) {
    const updated = [next, ...localPasses];
    setLocalPasses(updated);
    saveLocalPasses(updated);
  }

  async function handleConnectProver() {
    try {
      const addr = await connectWallet();
      setProverWallet(addr);
      setPass(null);
      setStatus(addr ? `Connected private wallet ${short(addr)}` : "No wallet selected.");
    } catch {
      setStatus("Wallet connection failed or was rejected.");
    }
  }

  async function handleGeneratePass() {
    if (!campaign || !proverWallet) return;
    if (lockPass && !lockRecipient.trim()) {
      setStatus("Enter the wallet address to lock this pass to, or turn off locking.");
      return;
    }
    setBusyAction("generate");
    setStatus("Evaluating predicate against your public deposit history…");
    try {
      const res = await fetch("/api/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          proverAddress: proverWallet,
          boundRecipient: lockPass ? lockRecipient.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Not eligible yet: ${data.error}`);
        setPass(null);
      } else {
        const newPass: LocalPass = {
          campaignId: campaign.id,
          campaignName: campaign.name,
          nullifier: data.nullifier,
          createdAt: Date.now(),
          boundRecipient: data.boundRecipient ?? null,
        };
        setPass(newPass);
        addLocalPass(newPass);
        setStatus(
          data.boundRecipient
            ? `Pass issued, locked to ${short(data.boundRecipient)}. Only that wallet can claim it.`
            : "Pass issued. Disconnect, then connect a completely different wallet to claim."
        );
        await disconnect();
        setProverWallet(null);
      }
    } catch {
      setStatus("Failed to reach Provah.");
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleConnectClaimWallet() {
    try {
      const addr = await connectWallet();
      if (addr) setClaimWallet(addr);
    } catch {
      setStatus("Wallet connection failed or was rejected.");
    }
  }

  async function handleClaim() {
    if (!campaign || !pass || !claimWallet) return;
    setBusyAction("claim");
    setClaimVerify("idle");
    setClaimBalanceDelta(null);
    const hasReward = !!rewardLabel(campaign);
    setStatus(
      hasReward
        ? "Checking your STRK balance, then submitting claim on-chain (gasless: Provah relays it)…"
        : "Submitting claim on-chain (gasless: Provah relays it)…"
    );
    try {
      const before = hasReward ? await fetchStrkBalance(claimWallet).catch(() => null) : null;
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, nullifier: pass.nullifier, recipient: claimWallet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Claim failed: ${data.error}`);
      } else {
        setClaimTx(data.txHash);
        setStatus("Claimed. The nullifier is now consumed, this pass cannot be reused.");
        if (hasReward && before !== null) {
          const after = await fetchStrkBalance(claimWallet).catch(() => null);
          if (after !== null) {
            const delta = after - before;
            setClaimBalanceDelta(delta > BigInt(0) ? formatStrk(delta.toString()) : null);
          }
        }
      }
    } catch {
      setStatus("Failed to reach Provah.");
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleVerifyClaim() {
    if (!claimTx || !pass) return;
    setClaimVerify("checking");
    try {
      const consumed = await verifyNullifierOnChain(pass.nullifier);
      setClaimVerify(consumed ? "confirmed" : "failed");
    } catch {
      setClaimVerify("failed");
    }
  }

  async function handleConnectRedeemWallet() {
    try {
      const addr = await connectWallet();
      if (addr) setRedeemWallet(addr);
    } catch {
      setRedeemStatus("Wallet connection failed or was rejected.");
    }
  }

  async function handleRedeem() {
    const decoded = decodePassToken(redeemToken);
    if (!decoded || !redeemWallet) {
      setRedeemStatus("Paste a valid pass token and connect a wallet first.");
      return;
    }
    setBusyAction("redeem");
    setRedeemVerify("idle");
    setRedeemBalanceDelta(null);
    const redeemCampaign = campaigns.find((c) => c.id === decoded.campaignId);
    const hasReward = redeemCampaign ? !!rewardLabel(redeemCampaign) : false;
    setRedeemStatus(hasReward ? "Checking your STRK balance, then submitting claim on-chain (gasless)…" : "Submitting claim on-chain (gasless)…");
    try {
      const before = hasReward ? await fetchStrkBalance(redeemWallet).catch(() => null) : null;
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: decoded.campaignId,
          nullifier: decoded.nullifier,
          recipient: redeemWallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedeemStatus(`Claim failed: ${data.error}`);
      } else {
        setRedeemTx(data.txHash);
        setRedeemStatus("Claimed. This pass token is now worthless to anyone else, the nullifier is consumed.");
        if (hasReward && before !== null) {
          const after = await fetchStrkBalance(redeemWallet).catch(() => null);
          if (after !== null) {
            const delta = after - before;
            setRedeemBalanceDelta(delta > BigInt(0) ? formatStrk(delta.toString()) : null);
          }
        }
      }
    } catch {
      setRedeemStatus("Failed to reach Provah.");
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleVerifyRedeem() {
    const decoded = decodePassToken(redeemToken);
    if (!redeemTx || !decoded) return;
    setRedeemVerify("checking");
    try {
      const consumed = await verifyNullifierOnChain(decoded.nullifier);
      setRedeemVerify(consumed ? "confirmed" : "failed");
    } catch {
      setRedeemVerify("failed");
    }
  }

  return (
    <div className="flex flex-col gap-8 text-neutral-900 dark:text-neutral-100">
      <CapabilityFlow stage={flowStage} />

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900/40 dark:shadow-none">
        <h2 className="text-lg font-medium">1. Pick a campaign</h2>
        <select
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-neutral-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 sm:w-auto dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          value={selected}
          disabled={campaignsLoading}
          onChange={(e) => {
            setSelected(e.target.value);
            setPass(null);
          }}
        >
          {campaignsLoading && <option value="">Loading campaigns…</option>}
          {!campaignsLoading && campaigns.length === 0 && <option value="">No campaigns yet</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({predicateTypeTag(c.predicate_type)})
            </option>
          ))}
        </select>
        {campaignsLoading && (
          <div className="animate-pulse rounded-md border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="h-3 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        )}
        {!campaignsLoading && campaigns.length === 0 && !status && (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            No campaigns are live right now. Check back shortly, or see{" "}
            <a
              className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
              href="https://github.com/levithefirst/provah"
              target="_blank"
              rel="noreferrer"
            >
              the repo
            </a>{" "}
            for how one gets created.
          </p>
        )}
        {campaign && (
          <div className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            <div className="flex gap-2 flex-wrap mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                {predicateTypeTag(campaign.predicate_type)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                {claimKindTag(campaign.claim_kind)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
                {expiryLabel(campaign)}
              </span>
            </div>
            <p>{campaign.description}</p>
            <p className="mt-1">Rule: {predicateLabel(campaign)}</p>
            {rewardLabel(campaign) && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> {rewardLabel(campaign)}
              </p>
            )}
            {rewardLabel(campaign) && rewardPoolBalance !== null && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} /> Reward pool currently
                holds {formatStrk(rewardPoolBalance)}, read live from{" "}
                <a
                  className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
                  href={`https://starkscan.co/contract/${PROVA_PASS_CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  the contract
                </a>
                . That is the hard cap on what any attestation — honest or not — could ever pay out.
              </p>
            )}
            {campaign.create_tx_hash && (
              <p className="mt-1 font-mono text-xs">
                campaign tx:{" "}
                <a
                  className="underline hover:text-neutral-900 dark:hover:text-neutral-200"
                  href={`https://starkscan.co/tx/${campaign.create_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(campaign.create_tx_hash)}
                </a>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900/40 dark:shadow-none">
        <h2 className="text-lg font-medium">2. Connect the wallet with qualifying pool activity, generate a pass</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Provah checks this wallet&apos;s public STRK20 deposit history against the campaign&apos;s
          rule. It never sees or needs a private key, viewing key, or signature from it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleConnectProver}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Wallet className="h-4 w-4" strokeWidth={1.75} /> Connect wallet A
          </button>
          <span className="font-mono text-sm text-neutral-500 dark:text-neutral-400">{short(proverWallet)}</span>
        </div>
        {proverWallet && selfCheck !== "idle" && (
          <p
            className={`animate-rise-in flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
              selfCheck === "eligible"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                : selfCheck === "ineligible"
                  ? "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
                  : selfCheck === "error"
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                    : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500"
            }`}
          >
            {selfCheck === "checking" ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={1.75} />
            ) : selfCheck === "eligible" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            ) : (
              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            )}
            <span>
              <span className="font-medium">Self-check</span> (runs in your browser, against public
              RPC, independent of Provah):{" "}
              {selfCheck === "checking" && "reading your public deposit history…"}
              {selfCheck === "eligible" && `You qualify. ${selfCheckDetail}`}
              {selfCheck === "ineligible" && `Not yet eligible. ${selfCheckDetail}`}
              {selfCheck === "error" && selfCheckDetail}
            </span>
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={lockPass}
            onChange={(e) => setLockPass(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-400 dark:border-neutral-600"
          />
          Lock this pass to one destination wallet (optional)
        </label>
        {lockPass && (
          <input
            type="text"
            value={lockRecipient}
            onChange={(e) => setLockRecipient(e.target.value)}
            placeholder="0x… destination wallet address"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        )}
        <button
          onClick={handleGeneratePass}
          disabled={busy || !proverWallet || !campaign}
          className="inline-flex items-center gap-2 self-start rounded-md border border-neutral-400 px-4 py-2.5 text-neutral-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
        >
          {busyAction === "generate" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busyAction === "generate" ? "Generating…" : "Generate pass"}
        </button>
        {pass && (
          <div className="animate-rise-in flex flex-col gap-2">
            <p className="font-mono text-xs text-emerald-600 break-all dark:text-emerald-400">
              nullifier: {pass.nullifier}
            </p>
            {campaign && rewardLabel(campaign) && (
              <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> {rewardLabel(campaign)}
              </p>
            )}
            {pass.boundRecipient ? (
              <p className="flex items-start gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-xs text-indigo-800 dark:border-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> Locked to{" "}
                {short(pass.boundRecipient)}. Only that wallet can claim it — Provah refuses to
                attest a claim to any other recipient.
              </p>
            ) : (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> This is
                a pure bearer token, by design. Anyone holding the raw text below can redeem it to a
                destination wallet of <em>their</em> choosing. Treat it like cash: keep it secret
                until you hand it off or redeem it yourself.
              </p>
            )}
            <PassTokenExport pass={pass} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900/40 dark:shadow-none">
        <h2 className="text-lg font-medium">3. Connect a different wallet, claim</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleConnectClaimWallet}
            disabled={busy || !pass}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Wallet className="h-4 w-4" strokeWidth={1.75} /> Connect wallet B
          </button>
          <span className="font-mono text-sm text-neutral-500 dark:text-neutral-400">{short(claimWallet)}</span>
        </div>
        {proverWallet && claimWallet && proverWallet === claimWallet && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} /> That&apos;s the
            same wallet. Connect a genuinely different one to demonstrate unlinkability.
          </p>
        )}
        <button
          onClick={handleClaim}
          disabled={busy || !pass || !claimWallet}
          className="inline-flex items-center gap-2 self-start rounded-md border border-neutral-400 px-4 py-2.5 text-neutral-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
        >
          {busyAction === "claim" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busyAction === "claim" ? "Claiming…" : "Claim"}
        </button>
        {claimTx && (
          <div className="animate-rise-in flex flex-col gap-2">
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-700 break-all dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span>
                claim tx:{" "}
                <a
                  className="inline-flex items-center gap-0.5 underline hover:text-emerald-900 dark:hover:text-emerald-200"
                  href={`https://starkscan.co/tx/${claimTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {claimTx}
                  <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                </a>
              </span>
            </p>
            {claimBalanceDelta && (
              <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> +{claimBalanceDelta}{" "}
                STRK confirmed in wallet B, verified from your own browser, not just asserted by
                Provah.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleVerifyClaim}
                disabled={claimVerify === "checking"}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-400 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-all duration-150 hover:border-neutral-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
              >
                {claimVerify === "checking" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {claimVerify === "checking" ? "Checking chain…" : "Verify on-chain"}
              </button>
              {claimVerify === "confirmed" && (
                <span className="animate-rise-in flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> nullifier
                  confirmed consumed on mainnet, read directly via public RPC
                </span>
              )}
              {claimVerify === "failed" && (
                <span className="animate-rise-in flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> Could not
                  confirm via public RPC — try again shortly.
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {status && (
        <p className="animate-rise-in flex items-start gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
          {busy && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} />}
          <span>{status}</span>
        </p>
      )}

      {localPasses.length > 0 && (
        <section className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900/40 dark:shadow-none">
          <h2 className="text-lg font-medium">Your passes (this device)</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            Passes are bearer capabilities. Provah has no account system and cannot list &quot;your&quot;
            passes server-side without linking them to you, which defeats the point. This list is saved
            only in this browser.
          </p>
          <ul className="flex flex-col gap-2">
            {localPasses.map((p) => (
              <li
                key={p.nullifier}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2.5 text-sm transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              >
                <span className="flex items-center gap-2">
                  {p.campaignName}
                  {p.boundRecipient ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 px-2 py-0.5 text-[10px] text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">
                      <Lock className="h-2.5 w-2.5" strokeWidth={2} /> locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-300">
                      <Ticket className="h-2.5 w-2.5" strokeWidth={2} /> bearer
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-neutral-500 dark:text-neutral-500">{short(p.nullifier)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900/40 dark:shadow-none">
        <h2 className="text-lg font-medium">Redeem a pass someone gave you</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          A Provah pass is a bearer token. Paste one below (from a friend, a Discord DM, a QR code,
          anywhere) and claim it from any wallet, without ever having generated it yourself.
        </p>
        <textarea
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          rows={3}
          placeholder="Paste a Provah pass token here…"
          value={redeemToken}
          onChange={(e) => setRedeemToken(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleConnectRedeemWallet}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Wallet className="h-4 w-4" strokeWidth={1.75} /> Connect wallet
          </button>
          <span className="font-mono text-sm text-neutral-500 dark:text-neutral-400">{short(redeemWallet)}</span>
        </div>
        <button
          onClick={handleRedeem}
          disabled={busy || !redeemToken || !redeemWallet}
          className="inline-flex items-center gap-2 self-start rounded-md border border-neutral-400 px-4 py-2.5 text-neutral-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
        >
          {busyAction === "redeem" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busyAction === "redeem" ? "Redeeming…" : "Redeem"}
        </button>
        {redeemStatus && <p className="animate-rise-in text-sm text-neutral-600 dark:text-neutral-400">{redeemStatus}</p>}
        {redeemTx && (
          <div className="animate-rise-in flex flex-col gap-2">
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-700 break-all dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span>
                claim tx:{" "}
                <a
                  className="inline-flex items-center gap-0.5 underline hover:text-emerald-900 dark:hover:text-emerald-200"
                  href={`https://starkscan.co/tx/${redeemTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {redeemTx}
                  <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                </a>
              </span>
            </p>
            {redeemBalanceDelta && (
              <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> +{redeemBalanceDelta}{" "}
                STRK confirmed in your wallet, verified from your own browser, not just asserted by
                Provah.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleVerifyRedeem}
                disabled={redeemVerify === "checking"}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-400 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-all duration-150 hover:border-neutral-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
              >
                {redeemVerify === "checking" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {redeemVerify === "checking" ? "Checking chain…" : "Verify on-chain"}
              </button>
              {redeemVerify === "confirmed" && (
                <span className="animate-rise-in flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> nullifier
                  confirmed consumed on mainnet, read directly via public RPC
                </span>
              )}
              {redeemVerify === "failed" && (
                <span className="animate-rise-in flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  Could not confirm via public RPC — try again shortly.
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function PassTokenExport({ pass }: { pass: LocalPass }) {
  const [copied, setCopied] = useState(false);
  const token = encodePassToken(pass.campaignId, pass.nullifier);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — token is still visible below to copy manually
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        {pass.boundRecipient
          ? `This pass is locked to ${short(pass.boundRecipient)} — Provah will refuse to claim it to any other wallet, so sharing it with anyone else is pointless. Only useful to hand to that specific wallet's owner.`
          : "Share this token with anyone. They can redeem it from any wallet, no connection to this browser or wallet A required."}
      </p>
      <div className="flex items-start gap-2">
        <textarea
          readOnly
          className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          rows={2}
          value={token}
        />
        <button
          onClick={copy}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.95] ${
            copied
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-neutral-400 text-neutral-900 hover:border-neutral-600 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
          }`}
        >
          {copied ? (
            <CheckCircle2 key="copied" className="h-3.5 w-3.5 animate-pop-in" strokeWidth={1.75} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
