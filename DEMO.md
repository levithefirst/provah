# Prova Pass — 3-minute demo script

**Live app:** https://provah.vercel.app/ — the "STRK Loyalty Drop" campaign
is already live on it, so no setup is required to demo the read side.

**Setup before recording:** two Starknet wallets in the browser (or two
browser profiles) — Wallet A (holds real STRK20 deposits satisfying the
campaign's predicate) and Wallet B (a brand-new wallet with zero balance).

## 0:00 – 0:20 — The problem
"STRK20 makes your Starknet holdings private. But private state is a dead
end by itself — you can't *do* anything with it without either giving up
the privacy, or building a custom proof system per use case. Prova turns
private STRK20 state into a portable, one-time capability: prove something
about your private holdings, then act on that proof from a wallet that has
no on-chain link to the one that holds the assets."

## 0:20 – 1:00 — Generate the pass
- Open the live app, show the campaign: "held ≥ 1 STRK for ≥ 7 days."
- Connect Wallet A ("this is the wallet with the private STRK20 history").
- Click **Generate Prova Pass**. Narrate what's happening on screen: Prova
  checks the predicate, derives a nullifier, hands back a pass — call out
  that the pass is *not* tied to any specific claiming wallet yet.
- Disconnect Wallet A on camera — emphasize this.

## 1:00 – 1:40 — Claim from a stranger wallet
- Connect Wallet B — a wallet that has never touched this campaign, never
  held the asset, has zero STRK for gas.
- Click **Claim**. Point out: this transaction is gas-sponsored — Wallet B
  needed nothing but the pass.
- Show the resulting tx hash on Starkscan/Voyager. Point at the calldata:
  `campaign_id`, `nullifier`, `recipient`, a signature — nothing that
  names Wallet A.

## 1:40 – 2:10 — Prove the nullifier is consumed
- Try to claim again with the same pass (same nullifier) — show the
  on-chain revert (`nullifier consumed`).
- Optionally: call `is_nullifier_consumed` as a view call to show it's
  `true` — provable without trusting Prova's backend at all.

## 2:10 – 2:40 — Why it matters: what's private, what's not
- Walk through the README's table live: deposits are public by STRK20's
  own design (show the `Deposit` event on Starkscan); what Prova adds is
  the *unlinkable claim*, enforced by an on-chain nullifier registry.
- One sentence on the current trust boundary: "the predicate check itself
  is a signed server attestation today, not a client-side ZK proof — the
  STRK20 mainnet proving-service endpoint needed for that isn't publicly
  documented yet. Everything downstream of that check — replay
  prevention, cross-campaign reuse, the wallet-to-wallet unlinkability —
  is enforced on-chain, not by us."

## 2:40 – 3:00 — Close
"Prova Pass: private state in, portable capability out, consumed exactly
once, from anywhere. Repo, architecture doc, and the exact list of what's
private and what's not are all linked below."
