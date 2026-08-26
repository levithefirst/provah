# Prova Pass — 3-minute demo script

**Live app:** https://provah.vercel.app/ — four live campaigns (three
predicate types, plus one that pays a real STRK reward on redeem), all on
the same deployed contract. No setup required to demo the read side.

**Setup before recording:** two or three Starknet wallets/browser profiles
— Wallet A (holds real STRK20 deposits satisfying at least one campaign's
predicate), Wallet B (a brand-new wallet with zero balance), and optionally
a third context (a different browser/device) to make the pass-transfer
step land as a genuine cross-device handoff rather than two tabs.

## 0:00 – 0:20 — The problem

"STRK20 gives you private, shielded balances on Starknet. But proving
something about that activity and *acting* on it publicly usually means
either revealing the wallet that qualified, or building a custom proof
system per use case, per app. Prova is a capability layer: it turns any
provable fact about a wallet's STRK20 pool activity into a portable,
one-time capability — one that can carry a real reward, not just a record
— redeemable from a wallet that has no on-chain link to the one that
qualified."

## 0:20 – 0:50 — This isn't one campaign, it's a primitive

- Show the campaign switcher: four live campaigns — "STRK Loyalty Drop"
  (held ≥1 STRK for ≥7 days), "STRK Holder Badge" (balance right now, no
  duration), "Active Depositor" (deposit count), and "STRK Welcome Reward"
  (balance right now — but redeeming it pays out real STRK). Point out
  these are genuinely different predicate types and claim kinds against the
  *same* deployed contract — no redeploy between them.
- One line: "the contract never validates what the predicate was — only
  that Prova's attester signed the claim. That's what makes new predicate
  types, and new reward campaigns, free."

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

## 2:00 – 2:15 — Prove the nullifier is consumed

- Try to claim again with the same token — show the on-chain revert
  (`nullifier consumed`).
- Click **Verify on-chain** in the UI right after the claim — narrate that
  this isn't Provah's database talking, it's a fresh `is_nullifier_consumed`
  call the browser itself makes against public RPC. Provable without
  trusting Prova's backend at all.

## 2:15 – 2:20 — Optional: lock a pass to one wallet

- Back on step 2, check **"Lock this pass to one destination wallet"** and
  paste Wallet B's address before generating. Narrate: "by default this is
  a pure bearer token — anyone gets to choose the destination. Checking
  this box is the issuer choosing that destination instead, and the server
  refuses to sign a claim to anyone else — not a UI restriction, enforced
  in `/api/claim` before the attestation exists."

## 2:20 – 2:40 — Redeem doesn't just record a claim, it can pay one out

- Switch to the "STRK Welcome Reward" campaign. Generate and redeem a pass
  the same way. Pull up the recipient's STRK balance on Starkscan before
  and after: it goes from whatever it was to exactly `+0.05 STRK`, in the
  same transaction that consumed the nullifier.
- One line: "this isn't a special case — `claim_with_prova_pass` always had
  this payout path; we just funded the contract and pointed a campaign at
  it. Every reward campaign works exactly like this."

## 2:40 – 2:55 — Why it matters: what's private, what's not

- One line on the honest trust boundary: "the predicate check is evaluated
  against the pool's *public* deposit events, not hidden note state — and
  it's a signed server attestation today, not a client-side ZK proof. We
  tried to close that gap this pass too: a real, hand-built transaction
  against the pool's least-restrictive action reverted with the pool's own
  `EMPTY_PROOF_FACTS` error, proving on-chain that the mainnet proving
  service needed for that isn't reachable yet — not just undocumented."
  What's cryptographically guaranteed regardless of trusting that
  attestation: no replay, no redirecting a signed pass to a different
  campaign or recipient, and reward terms fixed at campaign creation, not
  chosen at claim time.

## 2:55 – 3:00 — Close

"Prova Pass: honest public eligibility in, a portable, value-bearing
capability out, consumed exactly once, from anywhere — four campaigns, one
contract, ten real mainnet transactions, one of which pays out real STRK on
redeem. Repo, architecture, and the exact list of what's private and what's
not are all linked below."
