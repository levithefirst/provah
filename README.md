# Prova Pass

**Private STRK20 state → a ZK-eligibility capability → consumed once, from a completely different wallet.**

STRK20 keeps your assets private. Prova lets you *use* that private state — unlock a
reward, claim an allowlist spot, prove a loyalty threshold — without ever
publishing a link between the wallet that holds the assets and the wallet
that claims the outcome.

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon)
against the live mainnet privacy pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.

## The flow

1. A campaign owner deploys a **predicate**: "held ≥ X of asset Y for ≥ N days."
2. A user with private STRK20 holdings requests a **Prova Pass** for that
   campaign. Prova checks the predicate and, if satisfied, signs a one-time
   capability bound to a fresh **nullifier**.
3. The user hands that pass to *any* wallet — a brand-new, funding-free one.
4. That wallet calls `claim_with_prova_pass` on the `ProvaPass` contract.
   The contract verifies Prova's signature and **consumes the nullifier**.
5. The pass cannot be reused. Nothing on-chain, and nothing Prova stores,
   links the claiming wallet back to the wallet whose holdings satisfied
   the predicate.

## What is private / what is not

This is the section that matters most — read it before treating any part of
the demo as a stronger privacy guarantee than it actually provides today.

| | Status |
|---|---|
| **Shielded balances and note-to-note transfers inside the STRK20 pool** | Private by the pool's own design — Prova doesn't touch this. |
| **That a deposit into the pool happened, its amount, and the depositor's address** | **Public.** STRK20 deposits are screened and emit a public `Deposit` event (confirmed directly from the pool's Cairo source and the hackathon's Day-0 guide). Prova's predicate evaluator reads this real, public event log — it is not reading anything private. |
| **The claim transaction and the recipient wallet** | Public, and by construction **not linkable** to the depositor address above: the `ProvaPass` contract only ever sees `(campaign_id, nullifier, recipient, signature)`. The nullifier is a Pedersen hash of `(campaign_id, prover_address, salt)` computed off-chain — nothing about the prover address is recoverable from it on-chain. |
| **The predicate check itself** | **This is the honest trust boundary, and it's temporary.** Evaluating "held ≥ X for ≥ N days" as a client-side ZK proof requires submitting through STRK20's transaction-prover (`starknet_proveTransaction`), which has no publicly documented mainnet endpoint anywhere we could find — see [`STATUS.md`](STATUS.md) for the full trail (checked: the hackathon repo, the starter kit, the official `starknet-privacy` repo's own reference demo, which ships the URL as a literal unfilled `TODO_MAINNET_PROVER_URL`). Until that endpoint (hosted or self-run) is wired in, Prova's backend evaluates the predicate directly against the *public* deposit history and signs the resulting capability — a server attestation, not a zero-knowledge proof. What stays trustless regardless: nobody, including Prova, can forge a pass for a predicate that doesn't hold, replay a pass, or use it on the wrong campaign — the STARK signature check and nullifier registry are enforced on-chain by `ProvaPass`, not by Prova's say-so at claim time. |
| **Who Prova can link, operationally** | Prova's server sees the prover's address for the duration of the `/api/pass` request (to read its public deposits) but stores only a one-way Pedersen commitment of it, never the raw address — see `src/lib/attestation.ts`. |

In short: **today**, unlinkability is real and enforced on-chain; the
predicate check is a signed server attestation instead of a client-side ZK
proof, because the infrastructure needed to make that check itself
zero-knowledge isn't publicly reachable yet. That is the single gap between
this v1 and the fully trustless version the architecture is designed for.

## Architecture

```
┌─────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  Wallet A        │        │   Prova backend       │        │  Wallet B (fresh)   │
│  (private holder) │───────▶│  /api/pass             │        │                      │
│                  │ address │  - reads public        │        │                      │
│                  │ + salt  │    Deposit events       │        │                      │
│                  │        │  - evaluates predicate  │        │                      │
│                  │        │  - derives nullifier     │        │                      │
│                  │        │  - stores pass in Neon   │        │                      │
└─────────────────┘        └──────────────────────┘        └────────────────────┘
                                                                        │
                                                                        │ campaignId, nullifier, recipient
                                                                        ▼
                                                              ┌──────────────────────┐
                                                              │  /api/claim            │
                                                              │  - signs attestation   │
                                                              │    over (id, null, B)  │
                                                              │  - relays tx (gasless  │
                                                              │    for wallet B)       │
                                                              └──────────────────────┘
                                                                        │
                                                                        ▼
                                                        ┌───────────────────────────────┐
                                                        │  ProvaPass.cairo (mainnet)      │
                                                        │  - verify ECDSA over attester    │
                                                        │  - check nullifier unconsumed    │
                                                        │  - consume nullifier              │
                                                        │  - pay out reward to wallet B     │
                                                        └───────────────────────────────┘
```

- **Contracts** (`contracts/prova_pass/`) — a single Cairo contract
  (`ProvaPass`) with `create_campaign`, `claim_with_prova_pass`, and a
  nullifier registry. Compiled with Scarb 2.9.2; artifacts vendored into
  `src/contracts/` for the app to declare/deploy.
- **Privacy SDK** (`vendor/starknet-privacy-sdk`, `vendor/starknet-privacy-client`)
  — StarkWare's real `@starkware-libs/starknet-privacy-sdk` and its
  client helpers, built from source (no public npm registry publish was
  found) and vendored so the app doesn't depend on GitHub Packages auth.
  Used today for its Pedersen/viewing-key/ECDSA primitives; wiring in
  `createPrivateTransfers` for actual shield/transfer calls is blocked on
  the missing prover endpoint (see above).
- **App** (`src/app`, Next.js App Router) — campaign browser, pass
  generation, cross-wallet claim UI, all in `src/app/ProvaApp.tsx`.
- **API** (`src/app/api`) — `/api/campaigns` (list), `/api/pass` (issue),
  `/api/claim` (redeem, gas-sponsored by Prova's operating account so a
  brand-new wallet needs zero STRK to claim), `/api/admin/*` (one-shot
  deploy/campaign-creation, token-gated).
- **DB** (Neon Postgres) — `campaigns`, `prova_passes`, `claims`,
  `mainnet_activity_log`. Public metadata only; see `contracts` for the
  schema. No private note data ever touches this database.
- **Mainnet execution** — this repo's own dev sandbox cannot reach
  Starknet RPC (see `STATUS.md`), so real transactions run either from the
  deployed Vercel app or via `.github/workflows/mainnet-admin.yml`
  (`scripts/mainnet-admin.mjs`), a `workflow_dispatch` action that runs on
  a GitHub-hosted runner with full internet access.

## Predicate

v1 ships exactly one predicate, as scoped: **held ≥ X of asset Y for ≥ N
days**, evaluated over the asset's public STRK20 deposit history for the
address that requests the pass (see "what is private / what is not"
above for exactly what that means).

## Running it yourself

```bash
npm install
cp .env.example .env.local   # fill in STARKNET_*, DATABASE_URL, PROVA_*
npm run dev
```

To compile the contract:

```bash
scarb build   # from contracts/prova_pass/
```

To deploy and seed a campaign for real (needs the env vars above as
GitHub Actions secrets on this repo, or as Vercel project env vars):

```bash
# via GitHub Actions (Actions tab → Mainnet admin action → Run workflow)
#   action: deploy
#   action: create-campaign, arg1..arg7: name asset minAmount minDays rewardToken rewardAmount expiryDays

# or locally, with the env vars exported:
node scripts/mainnet-admin.mjs deploy
node scripts/mainnet-admin.mjs create-campaign "STRK Loyalty Drop" 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938 1000000000000000000 7
```

## Mainnet transactions

See [`strk20.json`](strk20.json) — populated with real transaction hashes
as they land; see `STATUS.md` for exactly which ones are executed vs.
pending.

## License

MIT — see [`LICENSE`](LICENSE). Vendored `starknet-privacy` packages under
`vendor/` are StarkWare's own code, Apache-2.0, with their original
`LICENSE` preserved in each package directory.
