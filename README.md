# Prova Pass

**Live demo:** [provah.vercel.app](https://provah.vercel.app/) · **Contract:** [`0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`](https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402) · **Mainnet transactions:** see below · **Status:** [`STATUS.md`](STATUS.md)

Prova Pass turns a private STRK20 balance into a portable, one-time
capability. A user proves something about holdings they never reveal — "held
≥ X of asset Y for ≥ N days" — and receives a signed pass bound to a fresh
nullifier. That pass can be redeemed from *any* wallet, including one that
has never touched the qualifying assets and holds zero gas. The claim
transaction is public; nothing on-chain, and nothing Prova stores, links it
back to the wallet whose private holdings satisfied the predicate.

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon)
against the live mainnet privacy pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.

## Try the live demo

1. Open [provah.vercel.app](https://provah.vercel.app/) — the "STRK Loyalty
   Drop" campaign (held ≥ 1 STRK for ≥ 7 days) is live on it.
2. **Connect wallet A** — a wallet with real STRK20 deposit history — and
   click **Generate Prova Pass**. Prova checks the predicate against its
   public deposit events and hands back a pass tied to a fresh nullifier.
3. Disconnect wallet A. **Connect wallet B** — any other wallet, funded or
   not — and click **Claim**. The transaction is gas-sponsored by Prova, so
   wallet B never needs to hold STRK.
4. The resulting claim transaction is real, on mainnet, and contains nothing
   that names wallet A.

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
node scripts/mainnet-admin.mjs create-campaign "STRK Loyalty Drop" 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d 1000000000000000000 7
```

## Mainnet transactions

`ProvaPass` is live on Starknet mainnet at
[`0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`](https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402)
(class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`).
Five real, confirmed mainnet transactions, machine-readable in
[`strk20.json`](strk20.json):

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` — operating account | [`0x266ff3…c010`](https://starkscan.co/tx/0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010) |
| 2 | `declare` — ProvaPass class | [`0x1d57d6…1153`](https://starkscan.co/tx/0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153) |
| 3 | `deploy` — ProvaPass instance | [`0x79375d…c70a`](https://starkscan.co/tx/0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a) |
| 4 | `create_campaign` — "STRK Loyalty Drop" | [`0x758de9…26e6`](https://starkscan.co/tx/0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6) |
| 5 | `claim_with_prova_pass` — cross-wallet claim | [`0x5ebf46…9dce`](https://starkscan.co/tx/0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce) |

**Note on scope:** all five transactions are against `ProvaPass`, the
contract this project built on top of the pool's public deposit events —
none of them are direct calls into the STRK20 pool contract itself. That's
a deliberate consequence of the same gap documented above: the pool's
state-changing entrypoints only accept calls through a mainnet
transaction-prover service whose endpoint isn't publicly published (see
"What is private / what is not" and `STATUS.md`). Prova reads the pool's
public `Deposit` events directly; it does not write to the pool.

## License

MIT — see [`LICENSE`](LICENSE). Vendored `starknet-privacy` packages under
`vendor/` are StarkWare's own code, Apache-2.0, with their original
`LICENSE` preserved in each package directory.
