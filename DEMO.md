# Prova Pass — 3-minute demo script

**Live app:** https://provah.vercel.app/ — three live campaigns, three
different predicate types, all on the same deployed contract. No setup
required to demo the read side.

**Setup before recording:** two or three Starknet wallets/browser profiles
— Wallet A (holds real STRK20 deposits satisfying at least one campaign's
predicate), Wallet B (a brand-new wallet with zero balance), and optionally
a third context (a different browser/device) to make the pass-transfer
step land as a genuine cross-device handoff rather than two tabs.

## 0:00 – 0:20 — The problem

"STRK20 makes your Starknet holdings private. But private state is a dead
end by itself — you can't *do* anything with it without either giving up
the privacy, or building a custom proof system per use case, per app. Prova
is a capability layer: it turns any provable fact about private STRK20
state into a portable, one-time capability you can act on from a wallet
that has no on-chain link to the one that holds the assets."

## 0:20 – 0:50 — This isn't one campaign, it's a primitive

- Show the campaign switcher: three live campaigns — "STRK Loyalty Drop"
  (held ≥1 STRK for ≥7 days), "STRK Holder Badge" (balance right now, no
  duration), "Active Depositor" (deposit count). Point out these are three
  genuinely different predicate types against the *same* deployed contract
  — no redeploy between them.
- One line: "the contract never validates what the predicate was — only
  that Prova's attester signed the claim. That's what makes new predicate
  types free."

## 0:50 – 1:25 — Generate the pass

- Connect Wallet A on the "STRK Loyalty Drop" campaign.
- Click **Generate Prova Pass**. Narrate: Prova checks the predicate,
  derives a nullifier, hands back a pass — call out the hero visual (Wallet
  A → Pass → Wallet B) highlighting that the pass isn't tied to any
  specific claiming wallet yet.
- Disconnect Wallet A on camera — emphasize this.

## 1:25 – 2:00 — The wow moment: hand the capability to someone else

- Copy the exported pass token from the UI.
- Switch to a second browser/device with zero relationship to the first —
  paste the token into **"Redeem a pass someone gave you,"** connect any
  wallet, and claim. Narrate: "this is the same claim endpoint, the same
  gasless relay — the only thing that crossed between these two contexts
  is a string of text. That's the capability, made literal."
- Show the resulting tx hash on Starkscan. Point at the calldata:
  `campaign_id`, `nullifier`, `recipient`, a signature — nothing that names
  Wallet A.

## 2:00 – 2:20 — Prove the nullifier is consumed

- Try to claim again with the same token — show the on-chain revert
  (`nullifier consumed`).
- Optionally: call `is_nullifier_consumed` as a view call to show it's
  `true` — provable without trusting Prova's backend at all.

## 2:20 – 2:45 — Why it matters: what's private, what's not

- One line on the honest trust boundary: "the predicate check itself is a
  signed server attestation today, not a client-side ZK proof — the STRK20
  mainnet proving-service endpoint needed for that isn't publicly
  documented, and we asked directly on the hackathon repo and got no
  answer. Swapping it out is a backend-only change — the contract's
  signature check doesn't move." Everything downstream of that check —
  replay prevention, cross-campaign binding, wallet-to-wallet
  unlinkability — is enforced on-chain, not by us.

## 2:45 – 3:00 — Close

"Prova Pass: private state in, portable capability out, consumed exactly
once, from anywhere — three predicate types, one contract, seven real
mainnet transactions. Repo, architecture, and the exact list of what's
private and what's not are all linked below."
