"use client";

import { useEffect, useState } from "react";
import { connect, disconnect } from "@starknet-io/get-starknet";

type Campaign = {
  id: string;
  name: string;
  description: string;
  predicate_asset: string;
  predicate_min_amount: string;
  predicate_min_days: number;
  reward_token: string;
  reward_amount: string;
  expiry: number;
  status: string;
  create_tx_hash: string | null;
};

function short(addr: string | null | undefined) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

async function connectWallet(): Promise<string | null> {
  const swo = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
  if (!swo) return null;
  const accounts = await swo.request({ type: "wallet_requestAccounts" });
  return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
}

export default function ProvaApp() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [proverWallet, setProverWallet] = useState<string | null>(null);
  const [claimWallet, setClaimWallet] = useState<string>("");
  const [pass, setPass] = useState<{ nullifier: string } | null>(null);
  const [status, setStatus] = useState<string>("");
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns(d.campaigns ?? []);
        if (d.campaigns?.[0]) setSelected(d.campaigns[0].id);
      })
      .catch(() => setStatus("Could not load campaigns."));
  }, []);

  const campaign = campaigns.find((c) => c.id === selected);

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
        setPass({ nullifier: data.nullifier });
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

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Prova Pass</h1>
        <p className="text-neutral-400">
          Private STRK20 state → one-time capability → claimed from a wallet nobody can link to it.
        </p>
      </header>

      <section className="flex flex-col gap-3">
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
              {c.name}
            </option>
          ))}
        </select>
        {campaign && (
          <div className="text-sm text-neutral-400 border border-neutral-800 rounded-md p-3">
            <p>{campaign.description}</p>
            <p className="mt-1">
              Predicate: held ≥ {campaign.predicate_min_amount} of {short(campaign.predicate_asset)} for ≥{" "}
              {campaign.predicate_min_days} days
            </p>
            {campaign.create_tx_hash && (
              <p className="mt-1 font-mono text-xs">campaign tx: {short(campaign.create_tx_hash)}</p>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">2. Connect your private wallet, generate a pass</h2>
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
          className="self-start px-4 py-2 border border-neutral-600 rounded-md disabled:opacity-40"
        >
          Generate Prova Pass
        </button>
        {pass && (
          <p className="font-mono text-xs text-emerald-400 break-all">nullifier: {pass.nullifier}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
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
          className="self-start px-4 py-2 border border-neutral-600 rounded-md disabled:opacity-40"
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
        <p className="text-sm text-neutral-400 border-t border-neutral-800 pt-4">{status}</p>
      )}

      <footer className="text-xs text-neutral-600 border-t border-neutral-800 pt-4">
        See{" "}
        <a className="underline" href="https://github.com/levithefirst/provah" target="_blank" rel="noreferrer">
          README — &quot;what is private / what is not&quot;
        </a>{" "}
        for exactly what this demo does and does not hide today.
      </footer>
    </div>
  );
}
