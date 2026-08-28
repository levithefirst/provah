"use client";

import { useEffect, useRef, useState } from "react";
import { connect, disconnect, type StarknetWindowObject } from "@starknet-io/get-starknet";
import { RpcProvider, hash, num } from "starknet";
import { issuePassTypedData, normalizePassDeploymentData, type PassDeploymentData } from "@/lib/passChallenge";
import { evaluateDepositCount, evaluateHeldSince, isAlwaysTruePredicate } from "@/lib/predicateMath";
import { decodePassToken, encodePassToken } from "@/lib/passToken";
import { claimFailureMessage } from "@/lib/claimCopy";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
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
  // Set locally the moment this device successfully claims it — purely a
  // display hint ("don't invite a doomed resubmit"), never trusted as the
  // source of truth: the server's own nullifier check is what actually
  // stops a reuse. A pass claimed from a DIFFERENT device still shows as
  // unclaimed here, since this list is per-browser, not server-tracked.
  claimed?: boolean;
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

// campaign_id is a #[key] on ProvaPass's own PassClaimed event
// (contracts/prova_pass/src/prova_pass.cairo), so "how many passes has
// this campaign paid out" is public, filterable chain data — read here
// the same way self-check reads Deposit events: independently, from the
// browser, no Provah backend involved.
const PASS_CLAIMED_EVENT_KEY = num.toHex(hash.starknetKeccak("PassClaimed"));

async function clientGetClaimCount(campaignId: string): Promise<number> {
  const provider = new RpcProvider({ nodeUrl: PUBLIC_RPC_URL });
  let count = 0;
  let continuationToken: string | undefined;
  do {
    const page = await provider.getEvents({
      address: PROVA_PASS_CONTRACT_ADDRESS,
      keys: [[PASS_CLAIMED_EVENT_KEY], [num.toHex(campaignId)]],
      chunk_size: 100,
      continuation_token: continuationToken,
      from_block: { block_number: 0 },
      to_block: "latest",
    });
    count += page.events.length;
    continuationToken = page.continuation_token;
  } while (continuationToken);
  return count;
}

type ClientDeposit = { amount: bigint; timestampSec: number };

// address:token -> the full deposit history already fetched for that pair,
// so switching campaigns (or re-checking the same campaign) on the same
// connected wallet doesn't re-scan the wallet's entire on-chain lifetime
// every time. Keyed by wallet address, so a wallet switch naturally lands
// on a different (initially empty) cache entry — nothing to invalidate by
// hand. "withTimestamps" tracks whether timestampSec was populated (only
// held_since needs it); a with-timestamps entry can serve a
// without-timestamps request, never the reverse. Only a complete,
// non-early-exited, non-aborted scan is cached — a partial result (from
// stopAtCount or a cancelled self-check) isn't safe to reuse for a
// different predicate that needs the full history.
type DepositCacheEntry = { deposits: ClientDeposit[]; withTimestamps: boolean };
const depositHistoryCache = new Map<string, DepositCacheEntry>();

function depositCacheKey(address: string, token: string): string {
  return `${address.toLowerCase()}:${token.toLowerCase()}`;
}

// Bounded-concurrency map — held_since's per-event block-timestamp lookups
// used to run as a strict sequential await-in-a-loop (an N+1 RPC
// waterfall); this fires a handful in parallel instead, without hammering
// public RPC with one request per deposit at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function clientGetDepositHistory(
  userAddress: string,
  tokenAddress: string,
  needTimestamps: boolean,
  opts: { stopAtCount?: number; shouldAbort?: () => boolean } = {}
): Promise<ClientDeposit[]> {
  const cacheKey = depositCacheKey(userAddress, tokenAddress);
  // A complete cached scan (with timestamps if this call needs them) always
  // wins — zero RPC for a campaign switch on the same wallet.
  const cached = depositHistoryCache.get(cacheKey);
  if (cached && (cached.withTimestamps || !needTimestamps)) {
    return cached.deposits;
  }

  const provider = new RpcProvider({ nodeUrl: PUBLIC_RPC_URL });
  const userFelt = num.toHex(userAddress);
  const tokenLower = tokenAddress.toLowerCase();
  const matchingRaw: { amountLow: string; blockHash: string | undefined }[] = [];
  let continuationToken: string | undefined;

  do {
    if (opts.shouldAbort?.()) break;
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
      if ((token ?? "").toLowerCase() === tokenLower) {
        matchingRaw.push({ amountLow: amountLow ?? "0", blockHash: ev.block_hash });
      }
    }
    continuationToken = page.continuation_token;
    // Early exit for deposit_count: once we already have enough
    // token-matching deposits, more history can't change the answer — stop
    // paginating instead of scanning the wallet's full lifetime history.
    if (opts.stopAtCount !== undefined && matchingRaw.length >= opts.stopAtCount) break;
  } while (continuationToken && !opts.shouldAbort?.());

  let timestamps: number[] = matchingRaw.map(() => 0);
  if (needTimestamps && !opts.shouldAbort?.()) {
    timestamps = await mapWithConcurrency(matchingRaw, 6, async (ev) => {
      if (opts.shouldAbort?.()) return 0;
      const block = await provider.getBlockWithTxHashes(ev.blockHash ?? "latest");
      return "timestamp" in block ? (block.timestamp as number) : 0;
    });
  }

  const deposits: ClientDeposit[] = matchingRaw.map((ev, i) => ({
    amount: BigInt(ev.amountLow),
    timestampSec: timestamps[i] ?? 0,
  }));

  if (!opts.shouldAbort?.() && opts.stopAtCount === undefined) {
    depositHistoryCache.set(cacheKey, { deposits, withTimestamps: needTimestamps });
  }

  return deposits;
}

// Session-lifetime cache: /api/campaigns rarely changes between one mount
// and the next remount of the same page (e.g. a fast-refresh or navigating
// away and back), so a second mount can skip the round trip entirely.
let campaignsCache: Campaign[] | null = null;

type SelfCheckResult = { eligible: boolean; total: bigint; count: number };

// Independent, client-only re-derivation of the exact predicate Prova's
// server will check. Runs before /api/pass is ever called, so a user (or a
// judge) never has to take Prova's "eligible" / "not eligible" verdict on
// faith — the same public deposit events, the same arithmetic, done in the
// browser. shouldAbort lets the caller (the self-check effect) bail out of
// any still-running RPC work the moment the wallet or campaign changes,
// instead of letting a stale request keep running just to have its result
// thrown away.
async function clientEvaluatePredicate(
  campaign: Campaign,
  userAddress: string,
  shouldAbort?: () => boolean
): Promise<SelfCheckResult> {
  const minAmount = BigInt(campaign.predicate_min_amount);

  // Always-true predicates need zero RPC — most importantly the Capability
  // Smoke Test (deposit_count, minimum 0), which must resolve instantly for
  // literally any wallet, including one with no on-chain history at all.
  // Shared with the server's identical short-circuit in predicate.ts so the
  // two can never silently drift apart on what counts as "always eligible."
  if (isAlwaysTruePredicate(campaign.predicate_type, minAmount)) {
    return { eligible: true, total: BigInt(0), count: 0 };
  }

  const needsTimestamps = campaign.predicate_type === "held_since";
  const stopAtCount = campaign.predicate_type === "deposit_count" ? Number(minAmount) : undefined;
  const deposits = await clientGetDepositHistory(userAddress, campaign.predicate_asset, needsTimestamps, {
    stopAtCount,
    shouldAbort,
  });

  if (campaign.predicate_type === "deposit_count") {
    const { eligible, count } = evaluateDepositCount(deposits, minAmount);
    return { eligible, total: BigInt(count), count };
  }

  // held_since (real cutoff) and balance_threshold (minDays = 0, i.e. no
  // cutoff in the past) — the same shared math the server uses.
  const minDays = campaign.predicate_type === "held_since" ? campaign.predicate_min_days : 0;
  const { eligible, total } = evaluateHeldSince(deposits, minAmount, minDays);
  return { eligible, total, count: deposits.length };
}

// Distinct, actionable copy per ownership-verification failure stage (see
// OwnershipFailureStage in passChallenge.ts) — so a judge testing a
// brand-new wallet sees "deploy this account or use a wallet that supports
// deployment data," not the same generic "signature could not be verified"
// that also covers a genuinely bad signature. `detail` is the server's own
// safe diagnostic string, always shown too, so a residual failure is never
// silent even for a stage this mapping doesn't have specific copy for.
function ownershipFailureMessage(stage: string | undefined, detail: string | undefined): string {
  // Every branch ends with the raw [stage] + detail, not just the friendly
  // sentence in front of it — so a screenshot of this status line is
  // enough on its own to look up the exact failing stage in
  // OwnershipFailureStage / the server log, no follow-up questions needed.
  const suffix = ` [${stage ?? "unknown"}${detail ? `: ${detail}` : ""}]`;
  switch (stage) {
    case "missing_deployment_data":
      return `This wallet hasn't been deployed on-chain yet, and didn't share the deployment data Provah needs to verify it without requiring a deployment. Try Ready, Argent, or Braavos (they support this), or send one small transaction from this wallet first to deploy it, then Generate again.${suffix}`;
    case "deploy_commit":
      return `Provah couldn't match this wallet's deployment data to its address. Reconnect the wallet and try again.${suffix}`;
    case "signature_shape":
      return `Provah didn't recognize the signature this wallet returned. This account may use a multi-signer scheme that isn't supported yet.${suffix}`;
    case "rpc":
      return `Provah couldn't reach Starknet to check this wallet. Try again shortly.${suffix}`;
    case "typed_data":
      return `Provah's own signing request was malformed — this is a Provah bug, not something on your end. Please report it.${suffix}`;
    case "onchain":
    case "offchain":
    default:
      return `Wallet signature could not be verified. Refresh and try Generate again — this is not an eligibility failure.${suffix}`;
  }
}

function short(addr: string | null | undefined) {
  if (!addr) return "none";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatStrk(amountWei: string): string {
  const asNum = Number(BigInt(amountWei)) / 1e18;
  return `${asNum} STRK`;
}

// Deliberately says "deposited," never "hold" or "balance": every predicate
// here sums the pool's public Deposit events and never subtracts
// withdrawals. That's not a shortcut — the pool's own Withdrawal event
// keeps the withdrawing user encrypted (only the destination is a public
// key), so a withdrawal can't be linked back to the depositor it came from
// without breaking the pool's own privacy design. "Current balance" isn't
// honestly computable from public data; "cumulative deposited" is.
function predicateLabel(c: Campaign): string {
  switch (c.predicate_type) {
    case "balance_threshold":
      return `Deposited ≥ ${formatStrk(c.predicate_min_amount)} cumulatively, ever — no minimum holding period`;
    case "deposit_count":
      return `Make ≥ ${c.predicate_min_amount} separate deposit(s) into the pool (counts activity, not amount)`;
    case "held_since":
    default:
      return `Deposited ≥ ${formatStrk(c.predicate_min_amount)} cumulatively at least ${c.predicate_min_days} days ago`;
  }
}

// The zero-barrier campaign: deposit_count with a min of 0 is satisfied by
// every address, including a brand-new empty wallet, since count >= 0 is
// always true. Detected by predicate shape rather than by name, so it stays
// correct even if the campaign is renamed.
function isOpenAccessCampaign(c: Campaign): boolean {
  return c.predicate_type === "deposit_count" && BigInt(c.predicate_min_amount || "0") === BigInt(0);
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

// Matches /api/pass's exact multi-pass policy (BigInt(reward_amount || "0")
// > 0), independent of claim_kind — used here only to decide whether
// Generate should force a disconnect afterward (see handleGeneratePass),
// not to decide reward copy (that's rewardLabel's job).
function hasReward(c: Campaign): boolean {
  return BigInt(c.reward_amount || "0") > BigInt(0);
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

async function connectWalletHandle(): Promise<{ address: string; wallet: StarknetWindowObject } | null> {
  const swo = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
  if (!swo) return null;
  const accounts = await swo.request({ type: "wallet_requestAccounts" });
  const address = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
  return address ? { address, wallet: swo } : null;
}

async function connectWallet(): Promise<string | null> {
  const handle = await connectWalletHandle();
  return handle?.address ?? null;
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

/**
 * A styled combobox for campaign 1 — a plain <select> looks fine on desktop
 * but falls back to the OS's own bare radio-button sheet on mobile (see the
 * screenshot that prompted this), which reads as unpolished next to the
 * rest of the app. This renders its own floating list instead, built from
 * a real <button> + listbox (role="listbox"/"option", arrow-key + Escape
 * support) so it stays keyboard- and screen-reader-usable rather than just
 * looking like a dropdown.
 */
function CampaignSelect({
  campaigns,
  loading,
  selected,
  onSelect,
}: {
  campaigns: Campaign[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = campaigns.find((c) => c.id === selected) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = loading
    ? "Loading campaigns…"
    : !current
      ? campaigns.length === 0
        ? "No campaigns yet"
        : "Select a campaign"
      : `${current.name} (${predicateTypeTag(current.predicate_type)})${
          isOpenAccessCampaign(current) ? " — no deposit needed" : ""
        }`;

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={loading || campaigns.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-left text-neutral-900 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60 sm:w-[26rem] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="animate-rise-in absolute z-20 mt-1.5 max-h-80 w-full overflow-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg sm:w-[26rem] dark:border-neutral-800 dark:bg-neutral-900"
        >
          {campaigns.map((c) => {
            const isSelected = c.id === selected;
            return (
              <li key={c.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-accent/10 text-accent-ink"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="mt-0.5 h-4 w-4 shrink-0">
                    {isSelected && <Check className="h-4 w-4" strokeWidth={2} />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-500">
                      {predicateTypeTag(c.predicate_type)}
                      {isOpenAccessCampaign(c) && (
                        <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-accent-ink">
                          no deposit needed
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ProvaApp() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [proverWallet, setProverWallet] = useState<string | null>(null);
  // The raw wallet handle, kept only long enough to request the ownership
  // signature in handleGeneratePass — never sent anywhere, and cleared the
  // moment a pass is issued (handleGeneratePass already disconnects wallet A).
  const [proverWalletHandle, setProverWalletHandle] = useState<StarknetWindowObject | null>(null);
  const [pass, setPass] = useState<LocalPass | null>(null);
  const [localPasses, setLocalPasses] = useState<LocalPass[]>([]);
  const [claimWallet, setClaimWallet] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"idle" | "generate" | "claim" | "redeem">("idle");
  const busy = busyAction !== "idle";
  const [redeemToken, setRedeemToken] = useState("");
  const [redeemWallet, setRedeemWallet] = useState<string>("");
  // The status banner is the only feedback for Generate/Claim/Redeem, but it
  // renders once, near the bottom of a long page — pressing "Generate pass"
  // above the fold updated it silently off-screen, which read as "nothing
  // happened" (the button just goes back to its idle label) even when the
  // request actually failed or succeeded. Scrolling it into view on every
  // change makes every action's result actually visible without a manual
  // scroll, on desktop or a phone recording a demo.
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (status) statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [status]);
  const [redeemTx, setRedeemTx] = useState<string | null>(null);
  // Which nullifier redeemTx belongs to — lets the Redeem button re-enable
  // for a genuinely different pasted token while still refusing to resubmit
  // the one that just succeeded (the on-chain nullifier is one-time; a
  // resubmit would just bounce off the server's own 409, but the button
  // should say "already used" instead of inviting the click at all).
  const [redeemedNullifier, setRedeemedNullifier] = useState<string | null>(null);
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
  const [campaignClaimCount, setCampaignClaimCount] = useState<number | null>(null);
  // A plain ref, not state: a double-click (or Enter+click) can fire two
  // onClick handlers before React re-renders the disabled button, so the
  // `busy` state alone can't prevent double-submission — both handler
  // invocations would read the same stale, not-yet-busy snapshot of state.
  // A ref mutation is synchronous and shared across both closures, so the
  // second call sees the first call's guard immediately, in the same tick.
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    setLocalPasses(loadLocalPasses());
    if (campaignsCache) {
      const loaded = campaignsCache;
      setCampaigns(loaded);
      const openAccess = loaded.find(isOpenAccessCampaign);
      if (openAccess) setSelected(openAccess.id);
      else if (loaded[0]) setSelected(loaded[0].id);
      setCampaignsLoading(false);
      return;
    }
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        const loaded: Campaign[] = d.campaigns ?? [];
        setCampaigns(loaded);
        if (!d.error) campaignsCache = loaded;
        // Default new visitors to the open-access campaign so the happy path
        // works with zero deposit history and no reading required first.
        const openAccess = loaded.find(isOpenAccessCampaign);
        if (openAccess) setSelected(openAccess.id);
        else if (loaded[0]) setSelected(loaded[0].id);
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
    clientEvaluatePredicate(campaign, proverWallet, () => cancelled)
      .then((result) => {
        if (cancelled) return;
        setSelfCheck(result.eligible ? "eligible" : "ineligible");
        // Always-true predicates (the Capability Smoke Test) short-circuit
        // before reading any deposit history at all — result.count/total
        // are just placeholder zeros, not a real measurement. Saying
        // "0 deposit(s) found" here reads as a stale/wrong number to
        // anyone who has actually deposited (real STRK sent, self-check
        // still shows 0) when the truth is simpler: this campaign doesn't
        // check deposits at all, so there's nothing to report finding.
        setSelfCheckDetail(
          isAlwaysTruePredicate(campaign.predicate_type, BigInt(campaign.predicate_min_amount))
            ? "No deposit check required for this campaign — every wallet qualifies."
            : campaign.predicate_type === "deposit_count"
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

  // Read-only campaign activity, from the same public event log anyone
  // could query themselves — no new trust assumption, no Provah API call.
  // Fails soft to "null" (hidden) rather than blocking the UI if RPC is
  // slow or unreachable.
  useEffect(() => {
    if (!campaign) {
      setCampaignClaimCount(null);
      return;
    }
    let cancelled = false;
    setCampaignClaimCount(null);
    clientGetClaimCount(campaign.id)
      .then((count) => {
        if (!cancelled) setCampaignClaimCount(count);
      })
      .catch(() => {
        if (!cancelled) setCampaignClaimCount(null);
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

  function markLocalPassClaimed(nullifier: string) {
    setLocalPasses((prev) => {
      const updated = prev.map((p) => (p.nullifier === nullifier ? { ...p, claimed: true } : p));
      saveLocalPasses(updated);
      return updated;
    });
  }

  async function handleConnectProver() {
    try {
      const handle = await connectWalletHandle();
      setProverWallet(handle?.address ?? null);
      setProverWalletHandle(handle?.wallet ?? null);
      setPass(null);
      setStatus(handle ? `Connected private wallet ${short(handle.address)}` : "No wallet selected.");
    } catch {
      setStatus("Wallet connection failed or was rejected.");
    }
  }

  // get-starknet has no "click away to disconnect" gesture — before this,
  // the only way to switch wallets was to click Connect again and dismiss
  // the picker, which merely fails to connect a new wallet without actually
  // clearing the old one from get-starknet's own stored session.
  async function handleDisconnectProver() {
    try {
      await disconnect();
    } finally {
      setProverWallet(null);
      setProverWalletHandle(null);
      setStatus("Wallet A disconnected.");
    }
  }

  async function handleGeneratePass() {
    if (!campaign || !proverWallet || !proverWalletHandle) return;
    if (lockPass && !lockRecipient.trim()) {
      setStatus("Enter the wallet address to lock this pass to, or turn off locking.");
      return;
    }
    if (actionInFlightRef.current) return; // guards against a double-click firing this twice
    actionInFlightRef.current = true;
    setBusyAction("generate");
    setStatus("Confirm in your wallet: proving you control this address…");
    try {
      // Proves proverWallet actually controls this address, before Provah
      // reads its public deposit history — without this, anyone who merely
      // knew an eligible address (itself public) could mint a pass for it.
      const signature = await proverWalletHandle.request({
        type: "wallet_signTypedData",
        params: issuePassTypedData(campaign.id),
      });
      // Starknet accounts are counterfactual until their first transaction —
      // a genuinely fresh wallet (exactly what the Capability Smoke Test
      // invites) has no deployed contract yet for Provah's server-side
      // is_valid_signature check to call. Best-effort: an already-deployed
      // wallet rejects this request (ACCOUNT_ALREADY_DEPLOYED), which is
      // fine — the server verifies those the normal on-chain way. If this
      // fails for an actually-undeployed wallet, the server will report
      // stage "missing_deployment_data" and the UI below explains exactly
      // that, instead of a generic signature-failure message.
      let deploymentData: PassDeploymentData | null = null;
      try {
        // normalizePassDeploymentData accepts the wallet-api spec's
        // snake_case fields or the camelCase/alternate names some wallet
        // adapters actually send — see its own doc comment.
        const dd = await proverWalletHandle.request({ type: "wallet_deploymentData" });
        deploymentData = normalizePassDeploymentData(dd);
        if (dd && !deploymentData) {
          console.warn("[Generate] wallet_deploymentData returned but could not be normalized:", dd);
        }
      } catch (err) {
        console.warn(
          "[Generate] wallet_deploymentData unavailable (fine if this wallet is already deployed):",
          err instanceof Error ? err.message : String(err)
        );
        deploymentData = null;
      }
      setStatus("Issuing pass…");
      // Diagnostic only — no secrets (proverWallet and the campaign are
      // already public; the signature itself isn't logged, just whether
      // one is present) — so a "Generate looks broken" report can be
      // cross-checked against exactly what left the browser.
      console.log("[Generate] POSTing /api/pass", {
        campaignId: campaign.id,
        proverAddress: proverWallet,
        hasSignature: !!signature,
        hasDeploymentData: !!deploymentData,
        locked: lockPass,
      });
      const res = await fetch("/api/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          proverAddress: proverWallet,
          signature,
          deploymentData,
          boundRecipient: lockPass ? lockRecipient.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Every failure mode below is deliberately worded differently:
        // conflating any of them under one banner ("not eligible") once
        // made a broken typed-data shape look identical to "not eligible"
        // on screen, even though eligibility was never actually checked.
        // Only a genuine 403 (predicate not satisfied) is really about
        // eligibility — a signature problem, a duplicate-issuance, an
        // inactive/expired campaign, or a server error are all something
        // else, and telling a judge "not eligible" for any of those is
        // simply false.
        if (data.error === "invalid_ownership_signature") {
          setStatus(ownershipFailureMessage(data.stage, data.detail));
        } else if (res.status === 403) {
          setStatus(`Not eligible yet: ${data.error}`);
        } else if (res.status === 409) {
          // The single most common "Generate looks broken" moment during a
          // demo: it worked once, then a retake (or re-testing) with the
          // SAME wallet on the SAME campaign correctly hits the one-pass-
          // per-wallet-per-campaign guarantee. That's not a bug — the
          // server's own error string is already the plain-language fix
          // ("...connect a new empty wallet"), not a raw error code, so
          // it's shown as-is rather than re-wrapped with an "Already
          // issued:" prefix that would make it read like an error again.
          setStatus(data.error);
        } else if (res.status === 400 || res.status === 404) {
          setStatus(`This campaign can't issue a pass right now: ${data.error}`);
        } else {
          setStatus(`Provah couldn't process this: ${data.error}`);
        }
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
        // Reward campaigns are one-pass-per-wallet (the reward pool could
        // otherwise be drained by one address generating many passes), so
        // disconnecting nudges toward the intended flow: this wallet is
        // done, connect a different one to claim. Non-reward campaigns
        // (the Capability Smoke Test, or any other campaign with nothing
        // to drain) allow unlimited passes per wallet by design — forcing
        // a disconnect there would just be friction with no purpose, so
        // this wallet stays connected and Generate can be clicked again
        // immediately.
        if (hasReward(campaign)) {
          setStatus(
            data.boundRecipient
              ? `Pass issued, locked to ${short(data.boundRecipient)}. Only that wallet can claim it.`
              : "Pass issued. Disconnect, then connect a completely different wallet to claim."
          );
          await disconnect();
          setProverWallet(null);
          setProverWalletHandle(null);
        } else {
          setStatus(
            data.boundRecipient
              ? `Pass issued, locked to ${short(data.boundRecipient)}. Only that wallet can claim it.`
              : "Pass issued. This campaign allows multiple passes per wallet — Generate again anytime, or connect a different wallet to claim."
          );
        }
      }
    } catch {
      setStatus("Wallet declined to sign, or Provah was unreachable.");
    } finally {
      actionInFlightRef.current = false;
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

  async function handleDisconnectClaimWallet() {
    try {
      await disconnect();
    } finally {
      setClaimWallet("");
      setStatus("Wallet B disconnected.");
    }
  }

  async function handleClaim() {
    if (!campaign || !pass || !claimWallet || claimTx) return;
    if (actionInFlightRef.current) return; // guards against a double-click firing this twice
    actionInFlightRef.current = true;
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
      const [before, res] = await Promise.all([
        hasReward ? fetchStrkBalance(claimWallet).catch(() => null) : Promise.resolve(null),
        fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id, nullifier: pass.nullifier, recipient: claimWallet }),
        }),
      ]);
      const data = await res.json();
      if (!res.ok) {
        setStatus(claimFailureMessage(res.status, data));
      } else {
        setClaimTx(data.txHash);
        markLocalPassClaimed(pass.nullifier);
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
      actionInFlightRef.current = false;
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

  async function handleDisconnectRedeemWallet() {
    try {
      await disconnect();
    } finally {
      setRedeemWallet("");
      setRedeemStatus("Wallet disconnected.");
    }
  }

  async function handleRedeem() {
    const decoded = decodePassToken(redeemToken);
    if (!decoded || !redeemWallet) {
      setRedeemStatus("Paste a valid pass token and connect a wallet first.");
      return;
    }
    if (decoded.nullifier === redeemedNullifier) return; // already claimed this exact token — see the button's own disabled state
    if (actionInFlightRef.current) return; // guards against a double-click firing this twice
    actionInFlightRef.current = true;
    setBusyAction("redeem");
    setRedeemVerify("idle");
    setRedeemBalanceDelta(null);
    const redeemCampaign = campaigns.find((c) => c.id === decoded.campaignId);
    const hasReward = redeemCampaign ? !!rewardLabel(redeemCampaign) : false;
    setRedeemStatus(hasReward ? "Checking your STRK balance, then submitting claim on-chain (gasless)…" : "Submitting claim on-chain (gasless)…");
    try {
      const [before, res] = await Promise.all([
        hasReward ? fetchStrkBalance(redeemWallet).catch(() => null) : Promise.resolve(null),
        fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: decoded.campaignId,
            nullifier: decoded.nullifier,
            recipient: redeemWallet,
          }),
        }),
      ]);
      const data = await res.json();
      if (!res.ok) {
        setRedeemStatus(claimFailureMessage(res.status, data));
      } else {
        setRedeemTx(data.txHash);
        setRedeemedNullifier(decoded.nullifier);
        markLocalPassClaimed(decoded.nullifier); // a no-op unless this device is also the one that generated it
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
      actionInFlightRef.current = false;
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
        <CampaignSelect
          campaigns={campaigns}
          loading={campaignsLoading}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            setPass(null);
          }}
        />
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
              {isOpenAccessCampaign(campaign) && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-accent/50 bg-accent/10 font-medium text-accent-ink">
                  No deposit needed · try now
                </span>
              )}
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
            {campaignClaimCount !== null && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
                {campaignClaimCount === 0
                  ? "No passes claimed yet for this campaign"
                  : `${campaignClaimCount} pass${campaignClaimCount === 1 ? "" : "es"} claimed so far`}
                , read live from ProvaPass's own <code>PassClaimed</code> events — public data, not
                a Provah-asserted count.
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
          rule. It never sees a private key or viewing key — but generating a pass does ask this
          wallet to sign a message proving you control it, before Provah reads anything.
        </p>
        {campaign && (
          <p
            className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
              isOpenAccessCampaign(campaign)
                ? "border-accent/40 bg-accent/10 text-accent-ink"
                : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
            }`}
          >
            {isOpenAccessCampaign(campaign) ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            )}
            {isOpenAccessCampaign(campaign)
              ? "No precondition: any wallet qualifies, including a brand-new, empty one."
              : "Precondition: this wallet must already have made a real STRK20 deposit into the live pool satisfying the rule below — Provah only reads existing public deposit history, it cannot deposit for you."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleConnectProver}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Wallet className="h-4 w-4" strokeWidth={1.75} /> Connect wallet A
          </button>
          {proverWallet && (
            <button
              onClick={handleDisconnectProver}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
            >
              Disconnect
            </button>
          )}
          <span className="font-mono text-sm text-neutral-500 dark:text-neutral-400">{short(proverWallet)}</span>
        </div>
        <div className={proverWallet && selfCheck !== "idle" ? undefined : "min-h-[2.25rem]"}>
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
              {selfCheck === "checking" && "Checking public deposits…"}
              {selfCheck === "eligible" && `You qualify. ${selfCheckDetail}`}
              {selfCheck === "ineligible" && `Not yet eligible. ${selfCheckDetail}`}
              {selfCheck === "error" && selfCheckDetail}
            </span>
          </p>
        )}
        </div>
        {proverWallet && selfCheck === "ineligible" && campaign && !isOpenAccessCampaign(campaign) && (
          <div className="animate-rise-in flex flex-col gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            <p>
              This is expected, not a bug: Provah only reads this wallet&apos;s <em>existing</em>{" "}
              public STRK20 deposit history — it can&apos;t deposit into the pool for you. To
              qualify for this campaign:
            </p>
            <ol className="ml-4 list-decimal">
              <li>Open Ready or Braavos on Starknet mainnet</li>
              <li>Shield / deposit some STRK into the live STRK20 privacy pool</li>
              <li>Come back, connect that same wallet as Wallet A, and self-check again</li>
            </ol>
            {campaigns.some(isOpenAccessCampaign) && (
              <p className="flex flex-wrap items-center gap-2">
                Want to try the full generate → claim → verify flow right now, no deposit needed?
                <button
                  onClick={() => {
                    const oa = campaigns.find(isOpenAccessCampaign);
                    if (oa) {
                      setSelected(oa.id);
                      setPass(null);
                    }
                  }}
                  className="inline-flex items-center rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-ink hover:bg-accent/20"
                >
                  Switch to Capability Smoke Test
                </button>
              </p>
            )}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={lockPass}
            onChange={(e) => setLockPass(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-400 accent-[#b7f34a] dark:border-neutral-600"
          />
          Lock this pass to one destination wallet (optional)
        </label>
        {lockPass && (
          <input
            type="text"
            value={lockRecipient}
            onChange={(e) => setLockRecipient(e.target.value)}
            placeholder="0x… destination wallet address"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        )}
        <button
          onClick={handleGeneratePass}
          disabled={busy || !proverWallet || !proverWalletHandle || !campaign}
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
              <p className="flex items-start gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs text-accent-ink">
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
          {claimWallet && (
            <button
              onClick={handleDisconnectClaimWallet}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
            >
              Disconnect
            </button>
          )}
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
          disabled={busy || !pass || !claimWallet || !!claimTx}
          className="inline-flex items-center gap-2 self-start rounded-md border border-neutral-400 px-4 py-2.5 text-neutral-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
        >
          {busyAction === "claim" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busyAction === "claim" ? "Claiming…" : claimTx ? "Claimed" : "Claim"}
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
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              CLI verification (optional): same check, no browser, no Provah backend —{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
                node scripts/verify-claim.mjs {pass?.nullifier}
              </code>
            </p>
          </div>
        )}
      </section>

      {status && (
        <p
          ref={statusRef}
          className="animate-rise-in flex items-start gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400"
        >
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
                <span className="flex flex-wrap items-center gap-2">
                  {p.campaignName}
                  {p.boundRecipient ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[10px] text-accent-ink">
                      <Lock className="h-2.5 w-2.5" strokeWidth={2} /> locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-300">
                      <Ticket className="h-2.5 w-2.5" strokeWidth={2} /> bearer
                    </span>
                  )}
                  {p.claimed && (
                    <span
                      title="Claimed from this device — the server's own nullifier check is what actually stops a reuse, this is just a local reminder."
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2} /> claimed
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
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
          {redeemWallet && (
            <button
              onClick={handleDisconnectRedeemWallet}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
            >
              Disconnect
            </button>
          )}
          <span className="font-mono text-sm text-neutral-500 dark:text-neutral-400">{short(redeemWallet)}</span>
        </div>
        <button
          onClick={handleRedeem}
          disabled={
            busy || !redeemToken || !redeemWallet || decodePassToken(redeemToken)?.nullifier === redeemedNullifier
          }
          className="inline-flex items-center gap-2 self-start rounded-md border border-neutral-400 px-4 py-2.5 text-neutral-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-400"
        >
          {busyAction === "redeem" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busyAction === "redeem"
            ? "Redeeming…"
            : decodePassToken(redeemToken)?.nullifier === redeemedNullifier
              ? "Already claimed"
              : "Redeem"}
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
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              CLI verification (optional): same check, no browser, no Provah backend —{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
                node scripts/verify-claim.mjs {decodePassToken(redeemToken)?.nullifier}
              </code>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function PassTokenExport({ pass }: { pass: LocalPass }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const token = encodePassToken(pass.campaignId, pass.nullifier);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    // Same token as the text field below, just encoded as a scannable
    // image — the pass token format itself is unchanged either way.
    QRCode.toDataURL(token, { margin: 1, width: 176 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      <div className="flex items-start gap-3">
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not a remote image; next/image's optimizer doesn't apply here
          <img
            src={qrDataUrl}
            alt="QR code encoding this pass token"
            width={88}
            height={88}
            className="shrink-0 rounded-md border border-neutral-200 bg-white p-1 dark:border-neutral-800"
          />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            readOnly
            className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            rows={2}
            value={token}
          />
          <button
            onClick={copy}
            className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.95] ${
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
    </div>
  );
}
