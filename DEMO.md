# Provah — demo script (90s–3min)

**Live app:** https://provah.vercel.app/ — five live campaigns on one deployed
contract, real mainnet transactions.

**Demo video:** _TODO — not yet recorded. See `strk20.json`'s `demo_video`
field and `STATUS.md`'s "BLOCKER: demo_video" note. This script is ready to
record against; nothing below is blocked on anything else._

Provah only reads a wallet's *existing* public STRK20 deposit history — it
can't deposit or shield on your behalf, because the mainnet prover endpoint
the pool's own deposit/shield actions require is unpublished (see
`STATUS.md`, "Attempted: pool-touching transactions"). That's why this
script has two independent beats instead of one: beat 1 needs nothing from
you, beat 2 needs a wallet that already shielded STRK into the pool.

**Setup before recording:**
- Beat 1 (smoke test): any wallet extension, no prior activity needed.
- Beat 2 (real campaign, optional but stronger): Wallet A with real STRK20
  deposit history (Ready or Braavos, already shielded ≥1 STRK), plus Wallet
  B (any other wallet, funded or brand new).
- Beat 3 (destination lock, optional): a third scratch wallet address to
  demo the "wrong wallet" rejection.

## Hook (0:00–0:10)

*"This is Provah. I can prove my wallet's real, public STRK20 activity, hand
a token to a total stranger, and they redeem it — with nothing on-chain
ever connecting the two wallets. Watch."*

## Beat 1 — Capability Smoke Test: any wallet, zero setup (0:10–0:50)

Proves the whole primitive works for literally anyone, before touching
anything that depends on real pool activity.

1. Select **"Capability Smoke Test"** in the campaign picker (it's the
   default for new visitors) — point out the **"no deposit needed"** badge.
2. **Connect any Wallet A**, even a brand-new one. *"No self-check delay
   needed here — this campaign is satisfied by any address, on purpose,
   so anyone can try the flow."* Click **Generate pass**, sign the
   ownership prompt, copy the token.
3. **Connect any Wallet B** (can be the exact same device, a different
   wallet) and click **Claim**. *"Gas-sponsored — wallet B needed zero
   STRK."*
4. Click **Verify on-chain**. *"That's my own browser reading
   `is_nullifier_consumed` straight off Starknet mainnet — independent of
   Provah's backend entirely."*

## Beat 2 — real predicate, real reward (0:50–1:40, needs a qualifying wallet)

If Wallet A has real STRK20 pool deposit history, switch to **"STRK Welcome
Reward"** and repeat the same shape with the real predicate and a real
payout:

1. **Connect Wallet A.** Point at the self-check that runs instantly:
   *"That check ran in my own browser, against public RPC, independent of
   Provah — I don't have to trust a server's yes/no, I just watched it
   happen."* Click **Generate pass**.
2. Copy the pass token, disconnect Wallet A. **Connect Wallet B** — any
   other wallet, funded or not — and click **Claim**.
3. Point at the result: the claim tx is real, on mainnet, and the STRK
   balance delta (+0.05 STRK) appears in the same panel. *"That's not a
   receipt. That's STRK that moved, in this transaction, to a wallet that
   never touched the pool."*
4. Click **Verify on-chain** again — same independent check, this time
   confirming a real payout, not just a capability record.

If no qualifying wallet is available when recording, skip this beat
entirely and say so on camera rather than faking it — the smoke test in
Beat 1 already proves the primitive end-to-end.

## Beat 3 — destination lock: fail then succeed (optional, +10–20s)

Shows the capability isn't always a flat bearer token — the issuer can
scope it.

1. Before generating a pass, check **"Lock this pass to one destination
   wallet"** and paste a specific address. Generate the pass.
2. Attempt to claim to a *different*, wrong wallet — Provah refuses with a
   clear error before ever signing. *"Rejected server-side, before the
   attester signs anything — not just a client-side warning."*
3. Retry the claim to the correct, locked wallet — it succeeds. *"Same
   pass, same nullifier, only the intended recipient can redeem it."*

## Closing line

*"Two live paths today: try it right now with any wallet, or bring real
STRK20 activity and walk away with a real reward. Same primitive either
way, and every step of it is independently checkable on-chain."*

## Backup plan

If a wallet extension isn't available in the recording environment, or the
live connect flow hiccups: fall back to `strk20.json` in the repo and pull
up the already-confirmed transactions directly on Starkscan — in
particular the reward-claim transaction, and narrate the same balance
delta from the block explorer instead of the live UI. The claim already
happened for real; the on-chain record doesn't depend on the live demo
working in the moment.

## Cut list if running long

1. Cut Beat 3 (destination lock) entirely — mention it exists, don't
   demo it live. This is the first thing to drop for a 90-second cut.
2. Cut the self-check narration in Beat 2 — let the "✅ You qualify" text
   speak for itself, keep moving.
3. If a qualifying wallet isn't available, cut Beat 2 and closing line
   entirely and end on Beat 1's Verify on-chain moment — the unlinkable
   cross-wallet claim plus independent verification is the core of the
   pitch; the reward payout is the strongest add-on, not the argument
   itself.

## Longer walkthrough

For a judge who wants the full picture beyond this script — all five
campaigns, the reward-pool solvency display, the honest trust-boundary
explanation, and the four real, direct STRK20 pool transactions the team
completed separately from the app (verified in `STATUS.md`, "Real STRK20
pool transactions") — see `STATUS.md` and the README's "Try the live
demo" section, which cover the same flow with every feature included,
unhurried.
