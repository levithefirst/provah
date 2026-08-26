# Prova Pass

**Live demo:** [provah.vercel.app](https://provah.vercel.app/) · **Contract:** [`0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`](https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402) · **7 mainnet transactions, 3 live campaigns:** see below · **Status:** [`STATUS.md`](STATUS.md)

Prova Pass is not a selective-disclosure dashboard. It's a **capability
layer**: a way to turn *any* provable fact about a private STRK20 balance
into a bearer token that acts on-chain, redeemable from a wallet that has
never touched the underlying assets and holds zero gas. The predicate can
be a holding period, a balance threshold, a deposit count, or — because the
contract never inspects what the predicate actually was, only that Prova
attested to *something* — anything else you can evaluate against public
chain data. The output is always the same primitive: a one-time,
transferable, unlinkable capability. That primitive is what's new here, not
any one campaign built on top of it.

## The primitive, in one paragraph

A user proves something about holdings they never reveal. Prova signs a
capability bound to a fresh nullifier and hands it back — not to a wallet,
to the *user*, as a bearer token. That token can sit in a browser, get
pasted into a Discord DM, or be printed as a QR code; it carries no wallet
binding until the moment someone redeems it. Whoever redeems it chooses the
destination wallet then and there, gas-sponsored, and the chain records
only `(campaign_id, nullifier, recipient, signature)` — nothing that
connects back to whoever originally qualified. This is the whole
architecture: **private state in, portable capability out, consumed
exactly once, from anywhere.**

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon)
against the live mainnet privacy pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.

## Try the live demo

1. Open [provah.vercel.app](https://provah.vercel.app/) — three campaigns
   are live on it right now, each a different predicate type (see
   "Multiple predicate types" below).
2. **Connect wallet A** — a wallet with real STRK20 deposit history — and
   click **Generate Prova Pass**. Prova checks the predicate against its
   public deposit events and hands back a pass tied to a fresh nullifier.
3. Copy the pass token, or just disconnect wallet A. **Connect wallet B** —
   any other wallet, funded or not — and click **Claim**. The transaction
   is gas-sponsored by Prova, so wallet B never needs to hold STRK.
4. Try the **"Redeem a pass someone gave you"** section instead: paste a
   pass token with no prior connection to the session that generated it,
   connect any wallet, and claim. This is the same bearer-token property,
   made literal and demoable.
5. The resulting claim transaction is real, on mainnet, and contains
   nothing that names wallet A.

## Multiple predicate types, one contract, one attester

`ProvaPass` doesn't hardcode a predicate — it only ever validates that
Prova's attester signed `(campaign_id, nullifier, recipient)`. That means
new predicate types ship as backend logic, not contract redeploys, and all
three below are already live against the same deployed contract:

| Predicate type | What it checks | Live campaign |
|---|---|---|
| `held_since` | Held ≥ X of asset Y for ≥ N days | "STRK Loyalty Drop" |
| `balance_threshold` | Held ≥ X of asset Y right now, no duration | "STRK Holder Badge" |
| `deposit_count` | Made ≥ N separate deposits of asset Y into the pool | "Active Depositor" |

All three read the same honest, public data source — the pool's `Deposit`
events — just aggregated differently. Adding a fourth type is a function in
`src/lib/predicate.ts`, not a new deployment.

The claim side is equally generic: a campaign's `claim_kind` is
`capability` (nullifier consumed, nothing transferred — an allowlist entry
or a provable one-time action), or `reward_token` (the contract also pays
out `reward_amount` of `reward_token` to the recipient). Same contract
entrypoint either way — `reward_amount = 0` is what makes a claim
capability-only.

## The flow

1. A campaign owner deploys a **predicate** of one of the types above.
2. A user with private STRK20 holdings requests a **Prova Pass** for that
   campaign. Prova checks the predicate and, if satisfied, signs a one-time
   capability bound to a fresh **nullifier** — this is the bearer token,
   not yet addressed to any wallet.
3. The user hands that token to *any* wallet — a brand-new, funding-free
   one, or literally anyone else's.
4. That wallet calls `claim_with_prova_pass` on the `ProvaPass` contract.
   The contract verifies Prova's signature and **consumes the nullifier**.
5. The token cannot be reused. Nothing on-chain, and nothing Prova stores,
   links the claiming wallet back to the wallet whose holdings satisfied
   the predicate.

## What is private / what is not

This is the section that matters most — read it before treating any part of
the demo as a stronger privacy guarantee than it actually provides today.

| | Status |
|---|---|
| **Shielded balances and note-to-note transfers inside the STRK20 pool** | Private by the pool's own design — Prova doesn't touch this. |
| **That a deposit into the pool happened, its amount, and the depositor's address** | **Public.** STRK20 deposits are screened and emit a public `Deposit` event (confirmed directly from the pool's Cairo source and the hackathon's Day-0 guide). Prova's predicate evaluators read this real, public event log — they are not reading anything private. |
| **The claim transaction and the recipient wallet** | Public, and by construction **not linkable** to the depositor address above: the `ProvaPass` contract only ever sees `(campaign_id, nullifier, recipient, signature)`. The nullifier is a Pedersen hash of `(campaign_id, prover_address, salt)` computed off-chain — nothing about the prover address is recoverable from it on-chain. |
| **The predicate check itself** | **This is the honest trust boundary, and it's temporary.** See "The attester today, and what replaces it" below. |
| **Who Prova can link, operationally** | Prova's server sees the prover's address for the duration of the `/api/pass` request (to read its public deposits) but stores only a one-way Pedersen commitment of it, never the raw address — see `src/lib/attestation.ts`. |

In short: **today**, unlinkability is real and enforced on-chain; the
predicate check is a signed server attestation instead of a client-side ZK
proof, because the infrastructure needed to make that check itself
zero-knowledge isn't publicly reachable yet. That is the single gap between
this v1 and the fully trustless version the architecture is designed for.

### The attester today, and what replaces it

Evaluating any of the three predicates above as a client-side ZK proof over
private note state requires submitting through STRK20's mainnet
transaction-prover (`starknet_proveTransaction`). We checked for a public
endpoint across every source we could find — the hackathon repo, the
starter kit, the official `starknet-privacy` reference demo (which ships
the URL as a literal unfilled `TODO_MAINNET_PROVER_URL`) — and asked
directly via a hackathon-repo issue. As of this write-up, a maintainer
thread asking the identical question ([issue #147](https://github.com/starkience/strk20-hackathon/issues/147),
opened days before this project) is still unanswered. See `STATUS.md` for
the full trail.

Until that endpoint (hosted or self-run) exists, Prova's backend evaluates
the predicate directly against the pool's *public* deposit history and
signs the resulting capability — a server attestation, not a
zero-knowledge proof. What stays trustless regardless: nobody, including
Prova, can forge a pass for a predicate that doesn't hold, replay a pass,
or use it on the wrong campaign — the ECDSA signature check and nullifier
registry are enforced on-chain by `ProvaPass`, not by Prova's say-so at
claim time.

**Swapping the attester for a real proof is a backend-only change:**

- `ProvaPass.cairo` does not change at all — `claim_with_prova_pass`
  already only checks `check_ecdsa_signature(message_hash, attester,
  signature_r, signature_s)` over `(campaign_id, nullifier, recipient)`. A
  ZK verifier could replace that check, or the attester's key could be
  replaced by a key controlled by the prover service itself, with zero
  changes to the nullifier registry or claim flow.
- `src/lib/predicate.ts`'s `evaluatePredicate` functions are the only code
  that would be replaced — swap the public-event read for a
  `starknet_proveTransaction` call against the user's private note state,
  and have that call itself produce the attestation (or a verifiable proof
  the contract checks directly instead of trusting a signature).
- Nothing about the bearer-token, cross-wallet-claim, or nullifier
  mechanics changes. Those are already trustless.

## Architecture

```
[Wallet A, private holder]
        │  address + salt
        ▼
[Prova backend: /api/pass]
        │  reads public Deposit events, evaluates predicate
        │  (held_since | balance_threshold | deposit_count — pluggable),
        │  derives nullifier, stores pass in Neon
        ▼
[Bearer token: (campaignId, nullifier)]
        │  exportable — copy/paste, QR, DM — redeemable by anyone, from anywhere
        ▼
[Wallet B, any wallet — connects and submits recipient]
        │  campaignId, nullifier, recipient
        ▼
[Prova backend: /api/claim]
        │  signs attestation over (campaignId, nullifier, recipient)
        │  relays the transaction — gasless for wallet B
        ▼
[ProvaPass.cairo, mainnet]
        - verify ECDSA over attester
        - check nullifier unconsumed, then consume it
        - pay out reward_amount of reward_token, if any
```

- **Contracts** (`contracts/prova_pass/`) — a single Cairo contract
  (`ProvaPass`) with `create_campaign`, `claim_with_prova_pass`, and a
  nullifier registry. It never validates what a campaign's predicate
  *was* — only the attester's signature over the claim triple — which is
  exactly what makes new predicate types and new campaigns free of
  redeploys. Compiled with Scarb 2.9.2; artifacts vendored into
  `src/contracts/` for the app to declare/deploy.
- **Privacy SDK** (`vendor/starknet-privacy-sdk`, `vendor/starknet-privacy-client`)
  — StarkWare's real `@starkware-libs/starknet-privacy-sdk` and its
  client helpers, built from source (no public npm registry publish was
  found) and vendored so the app doesn't depend on GitHub Packages auth.
  Used today for its Pedersen/viewing-key/ECDSA primitives; wiring in
  `createPrivateTransfers` for actual shield/transfer calls is blocked on
  the missing prover endpoint (see above).
- **App** (`src/app`, Next.js App Router) — campaign browser with
  predicate-type badges, pass generation, a bearer-token export/redeem
  flow, and the Wallet A → Pass → Wallet B visual, all in
  `src/app/ProvaApp.tsx`.
- **API** (`src/app/api`) — `/api/campaigns` (list), `/api/pass` (issue,
  predicate-type aware), `/api/claim` (redeem, gas-sponsored by Prova's
  operating account so a brand-new wallet needs zero STRK to claim),
  `/api/admin/*` (one-shot deploy/campaign-creation, token-gated).
- **DB** (Neon Postgres) — `campaigns` (now carrying `predicate_type` and
  `claim_kind`), `prova_passes`, `claims`, `mainnet_activity_log`. Public
  metadata only. No private note data ever touches this database.
- **Mainnet execution** — this repo's own dev sandbox cannot reach
  Starknet RPC (see `STATUS.md`), so real transactions run either from the
  deployed Vercel app or via `.github/workflows/mainnet-admin.yml`
  (`scripts/mainnet-admin.mjs`), a `workflow_dispatch` action that runs on
  a GitHub-hosted runner with full internet access.

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
#   action: create-campaign, arg1..arg8: name asset minAmount minDays rewardToken rewardAmount expiryDays predicateType

# or locally, with the env vars exported:
node scripts/mainnet-admin.mjs deploy
node scripts/mainnet-admin.mjs create-campaign "STRK Loyalty Drop" 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d 1000000000000000000 7 "" "" "" held_since
```

## Mainnet transactions

`ProvaPass` is live on Starknet mainnet at
[`0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`](https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402)
(class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`),
with **3 live campaigns** across all 3 predicate types. Seven real,
confirmed mainnet transactions, machine-readable in
[`strk20.json`](strk20.json):

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` — operating account | [`0x266ff3…c010`](https://starkscan.co/tx/0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010) |
| 2 | `declare` — ProvaPass class | [`0x1d57d6…1153`](https://starkscan.co/tx/0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153) |
| 3 | `deploy` — ProvaPass instance | [`0x79375d…c70a`](https://starkscan.co/tx/0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a) |
| 4 | `create_campaign` — "STRK Loyalty Drop" (`held_since`) | [`0x758de9…26e6`](https://starkscan.co/tx/0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6) |
| 5 | `claim_with_prova_pass` — cross-wallet claim | [`0x5ebf46…9dce`](https://starkscan.co/tx/0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce) |
| 6 | `create_campaign` — "STRK Holder Badge" (`balance_threshold`) | [`0x41c168…e9b3`](https://starkscan.co/tx/0x41c16869dcd1f3781e839f44b9ea86b867d872f4177e7790fee631d957de9b3) |
| 7 | `create_campaign` — "Active Depositor" (`deposit_count`) | [`0x12aa67…4496`](https://starkscan.co/tx/0x12aa67bcb97507d402cbe8a7308fd9a6c7ad3a9088227e4a35ad96603284496) |

**Note on scope:** all seven transactions are against `ProvaPass`, the
contract this project built on top of the pool's public deposit events —
none of them are direct calls into the STRK20 pool contract itself. That's
a deliberate consequence of the same gap documented above: the pool's
state-changing entrypoints only accept calls through a mainnet
transaction-prover service whose endpoint isn't publicly published. We
asked directly (see "The attester today" above) and got no answer before
this submission. Prova reads the pool's public `Deposit` events; it does
not write to the pool.

## License

MIT — see [`LICENSE`](LICENSE). Vendored `starknet-privacy` packages under
`vendor/` are StarkWare's own code, Apache-2.0, with their original
`LICENSE` preserved in each package directory.
