"use client";

import { useEffect, useState } from "react";
import { connect, disconnect } from "@starknet-io/get-starknet";

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
};

const LOCAL_PASSES_KEY = "prova_local_passes_v1";

function short(addr: string | null | undefined) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatStrk(amountWei: string): string {
  const asNum = Number(BigInt(amountWei)) / 1e18;
  return `${asNum} STRK`;
}

function predicateLabel(c: Campaign): string {
  switch (c.predicate_type) {
    case "balance_threshold":
      return `Hold ≥ ${formatStrk(c.predicate_min_amount)} right now — no minimum holding period`;
    case "deposit_count":
      return `Make ≥ ${c.predicate_min_amount} separate deposit(s) into the pool — activity, not balance`;
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
  return `Redeeming pays ${formatStrk(c.reward_amount)} to the claiming wallet — a real transfer, not just a record.`;
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
function CapabilityFlow({
  stage,
}: {
  stage: "idle" | "wallet-a" | "pass" | "wallet-b" | "claimed";
}) {
  const order = ["wallet-a", "pass", "wallet-b", "claimed"];
  const reached = (s: string) => order.indexOf(s) <= order.indexOf(stage === "idle" ? "" : stage);

  const nodeClass = (active: boolean, done: boolean) =>
    `relative flex flex-col items-center justify-center gap-1 rounded-xl border px-4 py-4 min-w-[9rem] transition-colors ${
      done
        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
        : active
          ? "border-neutral-100 bg-neutral-100/10 text-neutral-100 ring-2 ring-neutral-100/40 animate-pulse"
          : "border-neutral-800 text-neutral-500"
    }`;

  const arrowClass = (done: boolean) =>
    `h-px flex-1 min-w-[1.5rem] sm:min-w-[2.5rem] ${done ? "bg-emerald-500/60" : "bg-neutral-800"}`;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5">
      <p className="text-center text-base font-medium mb-4">
        🔒 Private balance <span className="text-neutral-500">turns into</span> 🎫 a bearer capability{" "}
        <span className="text-neutral-500">— redeemed by</span> 🔓 any wallet, unlinked.
      </p>
      <div className="flex items-center justify-center gap-1 sm:gap-3 overflow-x-auto">
        <div className={nodeClass(stage === "wallet-a", reached("wallet-a"))}>
          <span className="text-2xl leading-none">🔒</span>
          <span className="text-xs uppercase tracking-wide opacity-70">Wallet A</span>
          <span className="text-sm font-medium">private holder</span>
        </div>
        <div className={arrowClass(reached("pass"))} />
        <div className={nodeClass(stage === "pass", reached("pass"))}>
          <span className="text-2xl leading-none">🎫</span>
          <span className="text-xs uppercase tracking-wide opacity-70">Prova Pass</span>
          <span className="text-sm font-medium">bearer capability</span>
        </div>
        <div className={arrowClass(reached("wallet-b"))} />
        <div className={nodeClass(stage === "wallet-b" || stage === "claimed", reached("wallet-b"))}>
          <span className="text-2xl leading-none">🔓</span>
          <span className="text-xs uppercase tracking-wide opacity-70">Wallet B</span>
          <span className="text-sm font-medium">fresh, zero gas</span>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">
        No on-chain link, no shared address, no Prova-stored mapping between A and B — the pass
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
  const [busy, setBusy] = useState(false);
  const [redeemToken, setRedeemToken] = useState("");
  const [redeemWallet, setRedeemWallet] = useState<string>("");
  const [redeemTx, setRedeemTx] = useState<string | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<string>("");

  useEffect(() => {
    setLocalPasses(loadLocalPasses());
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns(d.campaigns ?? []);
        if (d.campaigns?.[0]) setSelected(d.campaigns[0].id);
        if (d.error) setStatus(`Could not load campaigns: ${d.error}`);
      })
      .catch((err) => setStatus(`Could not load campaigns: ${err instanceof Error ? err.message : String(err)}`));
  }, []);

  const campaign = campaigns.find((c) => c.id === selected);

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
    setBusy(true);
    setStatus("Evaluating predicate against your public deposit history…");
    try {
      const res = await fetch("/api/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, proverAddress: proverWallet }),
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
        };
        setPass(newPass);
        addLocalPass(newPass);
        setStatus("Prova Pass issued. Disconnect, then connect a completely different wallet to claim.");
        await disconnect();
        setProverWallet(null);
      }
    } catch {
      setStatus("Failed to reach Prova.");
    } finally {
      setBusy(false);
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
    setBusy(true);
    setStatus("Submitting claim on-chain (gasless — Prova relays it)…");
    try {
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
        setStatus("Claimed. The nullifier is now consumed — this pass cannot be reused.");
      }
    } catch {
      setStatus("Failed to reach Prova.");
    } finally {
      setBusy(false);
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
    setBusy(true);
    setRedeemStatus("Submitting claim on-chain (gasless)…");
    try {
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
        setRedeemStatus("Claimed. This pass token is now worthless to anyone else — the nullifier is consumed.");
      }
    } catch {
      setRedeemStatus("Failed to reach Prova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 text-neutral-100">
      <CapabilityFlow stage={flowStage} />

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        <h2 className="text-lg font-medium">1. Pick a campaign</h2>
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setPass(null);
          }}
        >
          {campaigns.length === 0 && <option value="">No campaigns yet</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {predicateTypeTag(c.predicate_type)}
            </option>
          ))}
        </select>
        {campaign && (
          <div className="text-sm text-neutral-400 border border-neutral-800 rounded-md p-3">
            <div className="flex gap-2 flex-wrap mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-300">
                {predicateTypeTag(campaign.predicate_type)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-300">
                {claimKindTag(campaign.claim_kind)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-800 text-neutral-500">
                {expiryLabel(campaign)}
              </span>
            </div>
            <p>{campaign.description}</p>
            <p className="mt-1">Predicate: {predicateLabel(campaign)}</p>
            {rewardLabel(campaign) && (
              <p className="mt-2 rounded-md border border-emerald-800 bg-emerald-500/10 px-2 py-1.5 text-emerald-300">
                💰 {rewardLabel(campaign)}
              </p>
            )}
            {campaign.create_tx_hash && (
              <p className="mt-1 font-mono text-xs">
                campaign tx:{" "}
                <a
                  className="underline"
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

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        <h2 className="text-lg font-medium">2. Connect the wallet with qualifying pool activity, generate a pass</h2>
        <p className="text-xs text-neutral-500">
          Prova checks this wallet&apos;s public STRK20 deposit history against the campaign&apos;s
          predicate — it never sees or needs a private key, viewing key, or signature from it.
        </p>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleConnectProver}
            disabled={busy}
            className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-md font-medium disabled:opacity-50"
          >
            Connect wallet A
          </button>
          <span className="font-mono text-sm text-neutral-400">{short(proverWallet)}</span>
        </div>
        <button
          onClick={handleGeneratePass}
          disabled={busy || !proverWallet || !campaign}
          className="self-start px-4 py-2 border border-neutral-600 rounded-md text-neutral-100 disabled:opacity-40"
        >
          Generate Prova Pass
        </button>
        {pass && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs text-emerald-400 break-all">nullifier: {pass.nullifier}</p>
            {campaign && rewardLabel(campaign) && (
              <p className="rounded-md border border-emerald-800 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300">
                💰 {rewardLabel(campaign)}
              </p>
            )}
            <p className="rounded-md border border-amber-800 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">
              ⚠️ This is a pure bearer token, by design — anyone holding the raw text below can
              redeem it to a destination wallet of <em>their</em> choosing. Prova does not support
              locking a pass to one recipient. Treat it like cash: keep it secret until you hand it
              off or redeem it yourself.
            </p>
            <PassTokenExport pass={pass} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        <h2 className="text-lg font-medium">3. Connect a different wallet, claim</h2>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleConnectClaimWallet}
            disabled={busy || !pass}
            className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-md font-medium disabled:opacity-50"
          >
            Connect wallet B
          </button>
          <span className="font-mono text-sm text-neutral-400">{short(claimWallet)}</span>
        </div>
        {proverWallet && claimWallet && proverWallet === claimWallet && (
          <p className="text-amber-400 text-sm">
            That&apos;s the same wallet — connect a genuinely different one to demonstrate unlinkability.
          </p>
        )}
        <button
          onClick={handleClaim}
          disabled={busy || !pass || !claimWallet}
          className="self-start px-4 py-2 border border-neutral-600 rounded-md text-neutral-100 disabled:opacity-40"
        >
          Claim
        </button>
        {claimTx && (
          <p className="font-mono text-xs text-emerald-400 break-all">
            claim tx:{" "}
            <a
              className="underline"
              href={`https://starkscan.co/tx/${claimTx}`}
              target="_blank"
              rel="noreferrer"
            >
              {claimTx}
            </a>
          </p>
        )}
      </section>

      {status && (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-sm text-neutral-400">
          {status}
        </p>
      )}

      {localPasses.length > 0 && (
        <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
          <h2 className="text-lg font-medium">Your passes (this device)</h2>
          <p className="text-sm text-neutral-500">
            Passes are bearer capabilities — Prova has no account system and cannot list &quot;your&quot;
            passes server-side without linking them to you, which defeats the point. This list is saved
            only in this browser.
          </p>
          <ul className="flex flex-col gap-2">
            {localPasses.map((p) => (
              <li
                key={p.nullifier}
                className="flex items-center justify-between gap-3 border border-neutral-800 rounded-md px-3 py-2 text-sm"
              >
                <span>{p.campaignName}</span>
                <span className="font-mono text-xs text-neutral-500">{short(p.nullifier)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        <h2 className="text-lg font-medium">Redeem a pass someone gave you</h2>
        <p className="text-sm text-neutral-500">
          A Prova Pass is a bearer token. Paste one below — from a friend, a Discord DM, a QR code,
          anywhere — and claim it from any wallet, without ever having generated it yourself.
        </p>
        <textarea
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 font-mono text-xs"
          rows={3}
          placeholder="Paste a Prova Pass token here…"
          value={redeemToken}
          onChange={(e) => setRedeemToken(e.target.value)}
        />
        <div className="flex gap-3 items-center">
          <button
            onClick={handleConnectRedeemWallet}
            disabled={busy}
            className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-md font-medium disabled:opacity-50"
          >
            Connect wallet
          </button>
          <span className="font-mono text-sm text-neutral-400">{short(redeemWallet)}</span>
        </div>
        <button
          onClick={handleRedeem}
          disabled={busy || !redeemToken || !redeemWallet}
          className="self-start px-4 py-2 border border-neutral-600 rounded-md text-neutral-100 disabled:opacity-40"
        >
          Redeem
        </button>
        {redeemStatus && <p className="text-sm text-neutral-400">{redeemStatus}</p>}
        {redeemTx && (
          <p className="font-mono text-xs text-emerald-400 break-all">
            claim tx:{" "}
            <a className="underline" href={`https://starkscan.co/tx/${redeemTx}`} target="_blank" rel="noreferrer">
              {redeemTx}
            </a>
          </p>
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
      <p className="text-xs text-neutral-500">
        Share this token with anyone — they can redeem it from any wallet, no connection to this
        browser or wallet A required.
      </p>
      <div className="flex gap-2 items-start">
        <textarea
          readOnly
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1 font-mono text-xs"
          rows={2}
          value={token}
        />
        <button
          onClick={copy}
          className="px-3 py-1 border border-neutral-600 rounded-md text-xs text-neutral-100 shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
