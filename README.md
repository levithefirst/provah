# Prova Pass

**Live demo:** [provah.vercel.app](https://provah.vercel.app/) · **Contract:** [`0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`](https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402) · **11 mainnet transactions (10 ProvaPass + 1 direct STRK20 pool transaction), 4 live campaigns, real STRK reward payouts on redeem:** see below · **Status:** [`STATUS.md`](STATUS.md)

> **Why Provah:** it turns private eligibility into a transferable, optionally
> destination-locked, independently verifiable capability — backed by a real
> STRK20 pool transaction and a live mainnet capability contract, not just a
> signed promise.

Prova Pass is not a selective-disclosure dashboard. It's a **capability
layer**: a way to turn *any* provable fact about STRK20 pool activity — a
holding period, a balance threshold, a deposit count, or anything else
evaluable against public chain data — into a bearer token that acts
on-chain, redeemable from a wallet that has never touched the underlying
assets and holds zero gas. The contract never inspects what the predicate
actually was, only that Prova attested to *something*. The output is
always the same primitive: a one-time, transferable, unlinkable capability
that can carry real value (a campaign can pay out a real ERC20 reward on
redeem, not just record a claim). That primitive is what's new here, not
any one campaign built on top of it.

## The primitive, in one paragraph

A wallet's **public** STRK20 pool activity — its deposit history, visible
on-chain to anyone — is checked against a campaign's predicate. If it
holds, Prova signs a capability bound to a fresh nullifier and hands it
back — not to a wallet, to the *user*, as a bearer token. That token can
sit in a browser, get pasted into a Discord DM, or be printed as a QR
code; by default it carries no wallet binding until the moment someone
redeems it, and the issuer can optionally lock it to one destination
wallet at generation time instead — a real scope decision, not just a
bearer-security disclaimer (see "Destination binding" below). Whoever
redeems an unlocked pass chooses the destination wallet then and there,
gas-sponsored, and — if the campaign carries a reward — receives a real
ERC20 payout in the same transaction, independently verifiable from the
claimer's own browser (see "Verify it yourself" below). The chain records
only `(campaign_id, nullifier, recipient, signature)` — nothing that
connects back to whoever originally qualified. This is the whole
architecture: **honest public eligibility in, a portable, value-bearing
capability out, consumed exactly once, from anywhere.** See "What is
private / what is not" below for exactly which part of this is private
today and which isn't — the honest answer is *less than the name
suggests*, and we say so plainly rather than let the word "private" carry
more than it should.

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon)
against the live mainnet privacy pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.

## Try the live demo

1. Open [provah.vercel.app](https://provah.vercel.app/) — four campaigns
   are live on it right now: three predicate types (see "Multiple
   predicate types" below), plus one, "STRK Welcome Reward," that pays out
   a real 0.05 STRK on redeem instead of just recording a claim.
2. **Connect wallet A** — a wallet with real STRK20 deposit history. The
   app immediately runs an independent, client-side eligibility check
   against public RPC — watch it agree with the server before you even
   click anything. Then click **Generate pass**: Prova checks the
   same predicate against its public deposit events and hands back a pass
   tied to a fresh nullifier.
3. Copy the pass token, or just disconnect wallet A. **Connect wallet B** —
   any other wallet, funded or not — and click **Claim**. The transaction
   is gas-sponsored by Prova, so wallet B never needs to hold STRK.
4. Try the **"Redeem a pass someone gave you"** section instead: paste a
   pass token with no prior connection to the session that generated it,
   connect any wallet, and claim. This is the same bearer-token property,
   made literal and demoable.
5. The resulting claim transaction is real, on mainnet, and contains
   nothing that names wallet A. Click **Verify on-chain** afterward — the
   app reads `is_nullifier_consumed` straight from public RPC, not from
   Provah's own database, and for the reward campaign shows the exact STRK
   balance delta it observed in your browser before and after the claim.
6. Before generating a pass, try checking **"Lock this pass to one
   destination wallet"** and pasting an address — that pass will then only
   ever be claimable by that one wallet; any other `recipient` is refused
   server-side before Provah even signs.

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
capability-only. **This isn't theoretical:** the fourth live campaign,
"STRK Welcome Reward" (`balance_threshold`, `reward_token`), funded the
deployed `ProvaPass` contract with real STRK and executed a real claim —
the recipient's on-chain STRK balance went from `0` to exactly
`50000000000000000` wei (0.05 STRK), verified before and after via
`balanceOf`, in the same transaction that consumed the nullifier. See
`strk20.json` for the funding tx, campaign-creation tx, and claim tx.

## Destination binding

A pass is a pure bearer token by default — anyone holding it chooses the
destination wallet at claim time. That's the maximally-flexible form, but
it isn't the only form the capability supports. At generation time, the
holder of wallet A can optionally lock the pass to one destination address
(`boundRecipient`, an additive, nullable column on `prova_passes`):
`/api/claim` checks it *before* signing — `BigInt(pass.bound_recipient) !==
BigInt(recipient)` returns `403` — so a locked pass genuinely cannot be
redeemed anywhere else, not merely "shouldn't be." This turns "bearer
token, by design, full stop" into an actual scope decision the issuer
makes: pure bearer for hand-off scenarios (gift a capability to someone
unknown at issuance time), or destination-bound for scenarios where the
receiving wallet is already known and the extra guarantee is worth losing
transferability. Nothing about the unlocked path changes — this is
strictly additive.

## Eligibility, checked in your browser before Prova ever sees it

The predicate check (see "The attester today" below for exactly why it's
still a server attestation and not a ZK proof) is the one real trust
boundary in this system. Everything that can be pushed out of that
boundary without the missing prover has been:

- **The client independently re-derives eligibility, from public data, on
  its own.** The moment wallet A connects, the app runs the *exact same
  computation* `src/lib/predicate.ts` performs server-side —
  `clientEvaluatePredicate` in `src/app/ProvaApp.tsx` reads the pool's
  public `Deposit` events straight from the browser's own RPC connection
  and evaluates the same predicate arithmetic — before `/api/pass` is ever
  called. The result ("✅ You qualify — 1.2 STRK found, need 1.0") is not a
  preview of what Prova will say; it's an independent confirmation a judge
  or a user can audit by reading the same open-source function and running
  it themselves, against data neither Prova nor the user controls.
- **Prova's server still receives the address** — that part can't be
  removed without the blocked prover, since *someone* has to check real
  chain history and only the caller can supply which address to check. But
  it was already the practical minimum: the server takes one address as
  input, computes over public data it fetches itself, and returns a
  signed capability — never a wallet history dump, a viewing key, or a
  private key. The client-side self-check above proves this is exactly
  what happens: if Prova's server were reading anything else, its verdict
  and the browser's independent verdict would disagree.
- **One pass per wallet per campaign, enforced server-side.** Nullifiers
  were previously derivable with a client-supplied `salt`, which meant a
  single qualifying wallet could in principle request unlimited passes for
  one campaign by varying the salt. `/api/pass` now also computes a
  deterministic, salt-free `address_commitment = pedersen(address,
  campaignId)` and rejects a second pass request for a commitment that's
  already on file (`409`), enforced by a unique index on
  `(campaign_id, address_commitment)` in Postgres. One real wallet, one
  pass, per campaign — not bounded only by good faith.

## Verify it yourself

Every claim is independently checkable without trusting Provah's UI at
all, straight from the browser's own public RPC connection
(`https://rpc.starknet.lava.build`), against the live contracts:

- **Nullifier consumption** — after a claim, click **Verify on-chain** and
  the app calls `is_nullifier_consumed` directly on `ProvaPass` — the same
  contract read anyone could make from a block explorer or their own
  script. It does not go through Provah's backend or database at all.
- **Reward delivery** — for reward campaigns, the app reads the claiming
  wallet's STRK `balanceOf` immediately before and after the claim
  transaction, both calls made client-side against the public RPC, and
  shows the exact delta. "Redeem pays out a real reward" stops being an
  assertion in a status message and becomes a number the browser itself
  fetched from mainnet.
- **The blast radius of a dishonest attestation is capped, and the cap is
  live.** `ProvaPass` can never pay out more than it currently holds — the
  campaign card for any reward campaign reads the contract's real STRK
  balance client-side and shows it: "reward pool currently holds X STRK…
  that is the hard cap on what any attestation, honest or not, could ever
  pay out." If the attester's key were ever compromised, the maximum
  possible damage is a public, checkable number, not an unbounded claim.

All of this reduces Provah's trust surface to exactly what "What is
private / what is not" documents, and no further: the predicate evaluation
is a signed attestation you have to trust once (and can now watch the
client independently agree with); everything downstream of that
signature — that a wallet can only ever get one pass per campaign, that a
claim consumed a specific nullifier, that a reward moved a specific amount
to a specific wallet and could never have exceeded the funded balance — is
independently auditable and never has to be taken on faith.

## The flow

1. A campaign owner deploys a **predicate** of one of the types above.
2. A user with STRK20 pool deposit history requests a **Prova Pass** for
   that campaign. Prova checks the predicate against that history — public
   on-chain data, not private note state — and, if satisfied, signs a
   one-time capability bound to a fresh **nullifier**. This is the bearer
   token, not yet addressed to any wallet.
3. The user hands that token to *any* wallet — a brand-new, funding-free
   one, or literally anyone else's.
4. That wallet calls `claim_with_prova_pass` on the `ProvaPass` contract.
   The contract verifies Prova's signature, **consumes the nullifier**, and
   — if the campaign carries a reward — pays it out in the same
   transaction.
5. The token cannot be reused. Nothing on-chain, and nothing Prova stores,
   links the claiming wallet back to the wallet whose deposit history
   satisfied the predicate.

## What is private / what is not

This is the section that matters most — read it before treating any part of
the demo as a stronger privacy guarantee than it actually provides today.

| | Status |
|---|---|
| **Shielded balances and note-to-note transfers inside the STRK20 pool** | Private by the pool's own design — Prova doesn't touch this. |
| **That a deposit into the pool happened, its amount, and the depositor's address** | **Public.** STRK20 deposits are screened and emit a public `Deposit` event (confirmed directly from the pool's Cairo source and the hackathon's Day-0 guide). Prova's predicate evaluators read this real, public event log — they are not reading anything private. |
| **The claim transaction and the recipient wallet** | Public, and by construction **not linkable** to the depositor address above: the `ProvaPass` contract only ever sees `(campaign_id, nullifier, recipient, signature)`. The nullifier is a Pedersen hash of `(campaign_id, prover_address, salt)` computed off-chain — nothing about the prover address is recoverable from it on-chain. |
| **The predicate check itself** | **This is the honest trust boundary, and it's temporary.** See "The attester today, and what replaces it" below. |
| **Who Prova can link, operationally** | Prova's server sees the prover's address for the duration of the `/api/pass` request (to read its public deposits) but stores only one-way Pedersen commitments of it, never the raw address — see `src/lib/attestation.ts`. **Be precise about a real trade-off this pass introduced:** one of those two stored commitments (`issuer_commitment`) includes a random salt and is unguessable without it; the other (`address_commitment`, added to enforce "one pass per wallet per campaign") is deterministic — `pedersen(address, campaignId)`, no salt — specifically so repeat requests for the same wallet collide. That means anyone with **database access** (in practice, only Prova operating honestly, or Prova compromised) could test a candidate address against a campaign and learn whether that address already holds a pass for it. It reveals nothing to anyone without database access, and nothing about which wallet claims a pass, but it is a narrower privacy guarantee against an already-trusted-or-compromised operator than the previous salted-only design — a deliberate trade against a concrete abuse (unlimited pass minting from one wallet), disclosed rather than left implicit. |

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
directly via a hackathon-repo issue. **This isn't a Provah-specific gap:**
the hackathon repo has three separate open issues asking the identical
question from different teams — [#204](https://github.com/starkience/strk20-hackathon/issues/204),
[#147](https://github.com/starkience/strk20-hackathon/issues/147), and
[#121](https://github.com/starkience/strk20-hackathon/issues/121) — and as
of this write-up, none has a maintainer response. Every team building a
real per-claim proof against this pool on mainnet is blocked on the same
unpublished infrastructure; this isn't a corner Provah cut.

We went one step further than checking docs: we hand-built and submitted a
real fee-estimation call for `EmitViewingKeySet` — the one pool action the
hackathon's own guide says needs neither a proof nor screening — against the
live pool contract's real ABI. It reached `apply_actions` correctly (no
deserialization error) and reverted with the pool's own `EMPTY_PROOF_FACTS`
error, three call-frames deep in its execution. That confirms, on-chain,
that *every* `apply_actions` call — not just deposits — requires a bundle of
STARK proof artifacts that only the undocumented prover service can
produce. See `STATUS.md` for the full transcript of that attempt.

There is a second route besides holding the prover key yourself: a
**privacy-enabled wallet** (Ready or Braavos) can reach the prover on the
user's behalf, through three wallet-injected RPC methods —
`wallet_supportedWalletApi`, `wallet_strk20Balances`,
`wallet_strk20InvokeTransaction` — confirmed against a real, MIT-licensed
reference implementation and a real cited Ready-wallet mainnet transaction
that shielded STRK through it. This build environment's own tooling
cannot drive that route headlessly (the real wallet binaries are
Chrome-Web-Store-only and unreachable from here, and the one
buildable-from-source alternative, Argent's `argent-x`, doesn't yet
contain the feature — see `STATUS.md`'s "Final attempt: the Wallet API
route" for the full trail) — but the route itself doesn't need this
environment, only a human with the right wallet, which is exactly how
it's meant to work. The team completed one such transaction directly: see
"Real STRK20 pool transaction" below.

Until that endpoint (hosted or self-run) exists, Prova's backend evaluates
the predicate directly against the pool's *public* deposit history and
signs the resulting capability — a server attestation, not a
zero-knowledge proof. **Be precise about what that means for trust:**
`ProvaPass.cairo` only ever checks that *some* signature from the
attester's key exists over `(campaign_id, nullifier, recipient)` — it has
no way to verify the predicate was actually satisfied. Whoever holds the
attester's private key (today, only Prova) could sign a pass for a
predicate that doesn't hold. That is the honest trust boundary, not
something this v1 avoids. What *is* enforced on-chain, independent of
Prova's honesty, once a signature exists: it cannot be replayed (the
nullifier registry consumes it exactly once), it cannot be redirected to a
different campaign or recipient than it was signed for (both are hashed
into the signed message), and — for reward campaigns — the payout amount
and token are fixed at campaign creation, not chosen by whoever claims.
Swapping the attester's signature for a real per-claim ZK proof removes
Prova from that trust position entirely; see below for exactly what
changes.

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
with **4 live campaigns** — the original 3 predicate types plus a live
reward campaign that pays out real STRK on redeem. Ten real, confirmed
`ProvaPass` mainnet transactions, machine-readable in
[`strk20.json`](strk20.json) — plus, separately, one real, direct
transaction against the STRK20 pool contract itself (see below):

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` — operating account | [`0x266ff3…c010`](https://starkscan.co/tx/0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010) |
| 2 | `declare` — ProvaPass class | [`0x1d57d6…1153`](https://starkscan.co/tx/0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153) |
| 3 | `deploy` — ProvaPass instance | [`0x79375d…c70a`](https://starkscan.co/tx/0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a) |
| 4 | `create_campaign` — "STRK Loyalty Drop" (`held_since`) | [`0x758de9…26e6`](https://starkscan.co/tx/0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6) |
| 5 | `claim_with_prova_pass` — cross-wallet claim | [`0x5ebf46…9dce`](https://starkscan.co/tx/0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce) |
| 6 | `create_campaign` — "STRK Holder Badge" (`balance_threshold`) | [`0x41c168…e9b3`](https://starkscan.co/tx/0x41c16869dcd1f3781e839f44b9ea86b867d872f4177e7790fee631d957de9b3) |
| 7 | `create_campaign` — "Active Depositor" (`deposit_count`) | [`0x12aa67…4496`](https://starkscan.co/tx/0x12aa67bcb97507d402cbe8a7308fd9a6c7ad3a9088227e4a35ad96603284496) |
| 8 | `transfer` — fund `ProvaPass` with 1 real STRK | [`0x76eeb4…7625`](https://starkscan.co/tx/0x76eeb4941bda080592816c3c51ca92da65c20de18c48e7d4782e90010927625) |
| 9 | `create_campaign` — "STRK Welcome Reward" (`balance_threshold`, `reward_token`) | [`0x1a64f5…32c0`](https://starkscan.co/tx/0x1a64f5d8963b89118464d4613511b7f65eeb8ffb12f52df887e25404e5b32c0) |
| 10 | `claim_with_prova_pass` — **real 0.05 STRK payout**, verified `0 → 50000000000000000` wei | [`0x45f6b0…14c`](https://starkscan.co/tx/0x45f6b0d60d1ef2b232885a416f562c16aea15365ea215efdd0db10c4da514c) |

Transaction 10's recipient (`0x4fdf9023…eb401f`) was a freshly generated
address with zero prior chain history — its STRK balance was verified `0`
before the claim and exactly `50000000000000000` wei (0.05 STRK) after,
in the same transaction that consumed the nullifier. That claim was
operator-attested via `mainnet-admin.mjs` to verify the payout mechanism
end-to-end with real funds — the mechanism itself
(`IERC20.transfer(recipient, reward_amount)` inside
`claim_with_prova_pass`, gated only by `reward_amount > 0`) is live and
general, exercised identically by any real user going through the
deployed app's `/api/pass` → `/api/claim` flow. See `STATUS.md` for the
full verification trail.

**Note on scope:** transactions 1–7, 9, and 10 are against `ProvaPass`, the
contract this project built on top of the pool's public deposit events;
transaction 8 is a plain ERC20 `transfer` on the STRK token contract, used
to fund `ProvaPass`. **None of these ten are direct calls into the STRK20
pool contract itself** — that's a separate transaction, below. Provah's own
backend reads the pool's public `Deposit` events; it does not write to the
pool. This isn't for lack of trying the app-side route: see "The attester
today" above and `STATUS.md` for a real, on-chain-confirmed attempt — a
hand-built `apply_actions` call for the pool's least-restrictive action
(registering a viewing key, which needs no screening) reached the live
contract and reverted with its own `EMPTY_PROOF_FACTS` error, proving that
every pool state-change an app submits *directly*, not just deposits, is
gated on a mainnet transaction-prover output with no published endpoint.
We asked directly (issue #147) and got no answer before this submission.

### Real STRK20 pool transaction (direct, separate from ProvaPass)

The app-side route above is blocked, but it isn't the only route: the
hackathon's own docs describe a second one, where a privacy-enabled
wallet reaches the prover on the user's behalf instead — see
`STATUS.md`'s "The Wallet API route, and why it's the one that worked" for the full
mechanics and why Provah's own tooling can't drive it headlessly. The
team completed one such transaction directly against the live pool
contract:

[`0x0684bdad671fb81afe3cc2c27038e867e352e3323f666e4fd967e0086fffc385`](https://voyager.online/tx/0x0684bdad671fb81afe3cc2c27038e867e352e3323f666e4fd967e0086fffc385) —
block 13929673, `ACCEPTED_ON_L1`, `SUCCEEDED`. A viewing-key registration
and 10 STRK shield ("enable private tokens"), verified independently by
this repo's own `tx-status` diagnostic
(`scripts/mainnet-admin.mjs tx-status <hash>`) rather than taken on the
hash's word: the pool contract itself is the emitter of `ViewingKeySet`,
`Deposit` (10 STRK), and `EncNoteCreated` events, each selector matched by
independently computing `starknet_keccak` over the event names — the exact
three-event pattern the hackathon docs and a real reference implementation
describe for a genuine wallet-mediated shield. Full detail, including the
selector hashes and the registered address, is in `STATUS.md` and
[`strk20.json`](strk20.json)'s `strk20_pool_transactions`.

This transaction is real and direct; it does not change the app-side
conclusion above. Provah's backend still cannot submit pool transactions
without the unpublished prover URL — this one was completed by a human
through a real wallet, which is exactly the route the docs describe for
this situation, not a workaround.

## License

MIT — see [`LICENSE`](LICENSE). Vendored `starknet-privacy` packages under
`vendor/` are StarkWare's own code, Apache-2.0, with their original
`LICENSE` preserved in each package directory.
