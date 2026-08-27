# Provah — 90-second demo script

**Live app:** https://provah.vercel.app/ — four live campaigns on one deployed
contract, real mainnet transactions, no setup required to watch.

**Setup before recording:** two browser profiles or devices — Wallet A (real
STRK20 deposit history satisfying at least one campaign's rule) and Wallet B
(any other wallet, funded or brand new). Keep the "STRK Welcome Reward"
campaign selected so the reward payout is visible in the same run.

## Hook (0:00–0:10)

*"This is Provah. I can prove something private about my wallet, hand a
token to a total stranger, and they redeem it — with nothing on-chain ever
connecting the two wallets. Watch."*

## Flow walkthrough (0:10–1:10)

1. **(0:10–0:25) Connect Wallet A.** Point at the self-check that appears
   instantly: *"That check ran in my own browser, against public RPC,
   independent of Provah — I don't have to trust a server's yes/no, I just
   watched it happen."*
2. **(0:25–0:40) Click Generate pass.** *"Provah signs a one-time
   capability — a bearer token, not tied to my wallet. I could lock it to
   one destination wallet right now if I wanted a guarantee instead of
   flexibility — leaving it a bearer token is what makes this handoff
   possible with a total stranger."* Copy the token. Disconnect Wallet A.
3. **(0:40–0:55) Switch context.** Paste the token into *"Redeem a pass
   someone gave you,"* connect Wallet B, click Redeem. *"Zero prior
   relationship between these two wallets. Gas-sponsored — wallet B needed
   zero STRK to claim."*
4. **(0:55–1:10) Point at the result.** The claim tx is real and on
   mainnet; for the reward campaign, the STRK balance delta (+0.05 STRK)
   appears in the same panel. *"That's not a receipt. That's STRK that
   moved, in this transaction, to a wallet that never touched the pool."*

## Closing wow moment (1:10–1:30)

Click **Verify on-chain**. *"This is the part that matters: that check
isn't Provah's word. It's my own browser reading `is_nullifier_consumed`
straight off Starknet mainnet, right now, independent of Provah's backend
entirely. Anyone watching this can do exactly what I just did."*

## Backup plan

If a wallet extension isn't available in the recording environment, or the
live connect flow hiccups: fall back to `strk20.json` in the repo and pull
up the already-confirmed transactions directly on Starkscan — in
particular tx #10, the real reward claim, and narrate the same balance
delta from the block explorer instead of the live UI. The claim already
happened for real; the on-chain record doesn't depend on the live demo
working in the moment.

## Cut list if running long

1. Cut the self-check narration in step 1 — let the "✅ You qualify" text
   speak for itself, keep moving.
2. Cut the destination-binding aside in step 2 — mention it exists, don't
   demo it live.
3. If still over: skip the reward campaign and use a plain capability
   campaign instead, cutting straight from claim to Verify on-chain.
   The unlinkable cross-wallet claim plus independent verification is the
   core of the pitch; the reward payout is the strongest add-on, not the
   argument itself.

## Longer walkthrough

For a judge who wants the full picture beyond 90 seconds — all four
predicate types, the destination-binding demo, the reward-pool solvency
display, the honest trust-boundary explanation, and the one real, direct
STRK20 pool transaction the team completed separately from the app
(`0x0684bdad…fc385`, verified in `STATUS.md`) — see `STATUS.md` and the
README's "Try the live demo" section, which cover the same flow with
every feature included, unhurried.
