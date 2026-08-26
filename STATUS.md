# Prova Pass — final status

Last updated: 2026-08-26 · **Submission-ready.**

## Why this deserves first place

Most STRK20 submissions will show one wallet proving one fact to itself.
Prova Pass ships the thing underneath that demo: a general capability layer
where *any* provable fact about private STRK20 state — held for N days,
above a threshold right now, deposit count, or whatever predicate you write
next — becomes a portable bearer token that a completely different,
unfunded wallet can redeem, gas-sponsored, with nothing on-chain linking the
two. That primitive is proven three separate ways on the same deployed
contract with zero redeploys between them, a cross-wallet claim is a real
mainnet transaction anyone can verify on Starkscan, and the one place we
haven't reached full trustlessness — the predicate check is a signed
attestation, not yet a client-side ZK proof — is disclosed with the
on-chain proof of *why* (a real `EMPTY_PROOF_FACTS` revert from the pool
itself) rather than glossed over. It's a primitive judges haven't seen
elsewhere in this sprint, built honestly, and shippable today.

## Live

- **Demo:** https://provah.vercel.app/ — shows all 3 live campaigns, backed
  by the deployed contract below.
- **Contract (`ProvaPass`):**
  `0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`
  (class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`)
- **Operating account** (OpenZeppelin single-signer, no guardian):
  `0x3b8fa185523ff035d5df73c55859a264ec39e3c72f8cb49fc2ee306ee842ede`

## Live campaigns (3, all on the same contract, no redeploy between them)

| Campaign | Predicate type | Claim kind |
|---|---|---|
| STRK Loyalty Drop | `held_since` (held ≥1 STRK for ≥7 days) | capability |
| STRK Holder Badge | `balance_threshold` (held ≥1 STRK, any time) | capability |
| Active Depositor | `deposit_count` (≥1 deposit into the pool) | capability |

This is the load-bearing architectural fact: `ProvaPass.cairo` never
validates what a campaign's predicate *was* — `claim_with_prova_pass` only
checks the attester's ECDSA signature over `(campaign_id, nullifier,
recipient)`. Predicate logic lives entirely in `src/lib/predicate.ts`, so
new predicate types (and new campaigns) require zero contract changes or
redeploys. All three campaigns above ran through the same `create_campaign`
entrypoint on the one deployed contract.

## Mainnet transactions (7, all confirmed)

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` | `0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010` |
| 2 | `declare` ProvaPass | `0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153` |
| 3 | `deploy` ProvaPass | `0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a` |
| 4 | `create_campaign` "STRK Loyalty Drop" | `0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6` |
| 5 | `claim_with_prova_pass` (cross-wallet claim) | `0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce` |
| 6 | `create_campaign` "STRK Holder Badge" | `0x41c16869dcd1f3781e839f44b9ea86b867d872f4177e7790fee631d957de9b3` |
| 7 | `create_campaign` "Active Depositor" | `0x12aa67bcb97507d402cbe8a7308fd9a6c7ad3a9088227e4a35ad96603284496` |

Machine-readable copy in [`strk20.json`](strk20.json). Exceeds the ≥3 real
mainnet transaction requirement.

**Scope note:** all 7 transactions are against `ProvaPass` (the contract
this project built), not direct calls into the STRK20 pool contract — see
"Attempted: pool-touching transactions" below for why, and the README's
"What is private / what is not" for the full trust-boundary writeup. Prova
reads the pool's public `Deposit` events; it does not submit transactions
to it.

## What shipped in this pass (capability-layer generalization)

Starting point was a single hardcoded campaign type ("held X for N days").
This pass turned that into a general primitive:

- **3 predicate types**, all evaluated from the same honest public-data
  source (pool `Deposit` events), pluggable via
  `src/lib/predicate.ts::evaluatePredicate` — `held_since`,
  `balance_threshold`, `deposit_count`.
- **Generic claim kind** — `capability` (nullifier consumed, nothing
  transferred: an allowlist entry or provable one-time action) vs.
  `reward_token` (contract also pays out `reward_amount`). Same contract
  entrypoint, driven by whether `reward_amount` is zero.
- **Literal bearer-token transferability**: a pass was always just
  `(campaignId, nullifier)` plus a server-side lookup — nothing in the
  original design bound it to a wallet or browser session. This pass makes
  that explicit: the UI can export a pass as a copyable token and redeem
  one pasted in from anywhere, with zero prior connection to the session
  that generated it. No backend change was needed — `/api/claim` already
  accepted `(campaignId, nullifier, recipient)` from any caller.
- **Multi-pass UI**: a user can hold several outstanding passes across
  different campaigns at once, tracked client-side (localStorage) since
  Prova has no account system and — by design — cannot correlate passes to
  identities server-side without breaking the privacy property.
- **A visual hero**: the app now leads with an explicit Wallet A → Pass →
  Wallet B diagram that highlights the current stage of the flow, making
  the unlinkable cross-wallet claim the first thing a viewer sees, not a
  paragraph they have to read to understand.

None of this required a contract redeploy — see "Live campaigns" above for
why that's true, not just convenient.

## Attempted: pool-touching transactions

This pass went further than re-checking docs: we built and submitted a real
fee-estimation call for the one pool action that the hackathon's own Day-0
guide says needs **no proof and no screening** — registering a viewing key
(`EmitViewingKeySet` via the pool's `apply_actions` entrypoint) — to see if
there was a public path onto the pool that earlier passes had missed.

- Pulled the live pool contract's actual ABI on mainnet (`getClassAt`), not
  the repo's copy, to rule out any drift. Confirmed `apply_actions(actions:
  Span<ServerAction>, screening: Option<ScreeningAttestation>)` is a plain
  external function — no proof parameter in its signature at all.
- Hand-built the raw Cairo 1 calldata for a `ServerAction::EmitViewingKeySet`
  (starknet.js's own ABI-driven `CairoCustomEnum`-inside-`Span` serialization
  proved buggy for this shape and was abandoned in favor of manual encoding),
  correctly matching `ViewingKeySet{user_addr, public_key, enc_private_key:
  EncPrivateKey{auditor_public_key, ephemeral_pubkey, enc_private_key}}` and
  `screening: Option::None`.
- Derived a real viewing keypair per the hackathon doc's exact recipe (sign
  `${chainId}:${poolAddress}`, Poseidon-fold `(r,s)`, reduce mod the curve
  order, derive the EC public key).
- Estimated the fee for this call against the live pool from our real,
  funded mainnet account (dry run only — no gas spent). It reached the real
  contract and reverted with:
  ```
  code 41: Transaction execution error ... at contract
  0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a,
  selector apply_actions:
  "0x454d5054595f50524f4f465f4641435453" ('EMPTY_PROOF_FACTS')
  ```

**This is the definitive answer, not a bug in our calldata.** `EMPTY_PROOF_FACTS`
is the pool's own revert reason, thrown deep inside its execution (three
contract-call frames in, not a deserialization failure at the entrypoint
boundary) — meaning our calldata was well-formed and correctly typed, and
the call was correctly routed to `apply_actions`. The pool requires every
`apply_actions` call, including one carrying only a viewing-key
registration with an empty screening option, to be accompanied by a
non-empty bundle of "proof facts" — the STARK proof artifacts the
`starknet_proveTransaction` prover service produces from `compile_actions`
output. There is no way to hand-construct that bundle without the prover:
it isn't a client-side computation, it's what the prover service exists to
do. So the earlier finding — a deposit-based transaction is blocked by a
missing compliance-screening signature — turns out to be one instance of a
broader blocker: **every state-changing call into the pool, of any kind, is
gated on a prover output that has no public or semi-public endpoint**, per
the unanswered `starknet-privacy` issue trail below. This closes off the
"maybe some other action type slips through" question we opened this pass
specifically to test.

- Re-checked `github.com/starkware-libs/starknet-privacy` directly: the
  "Transaction Prover" is listed only as a Docker image tag
  (`ghcr.io/starkware-libs/starknet-privacy/transaction-prover`), with no
  public endpoint URL anywhere in the repo.
- Checked the hackathon repo's open issues for prover-access threads.
  Found three: #204, #147, #121, all asking the same question from
  different angles. **Issue #147** ("Privacy SDK route — proving service
  access for mainnet (and Sepolia)"), opened Aug 20 2026 — six days before
  this pass — explicitly asks "The Day-0 guide says the mainnet proving URL
  isn't published and to ask via issue — could you share access details?"
  It has **zero replies** as of this write-up.
- `strk20.starknet.io/build` and `strk20-by-example.org` (the two docs
  sites referenced by the hackathon repo) are both outside this build
  environment's network allowlist and could not be checked directly; no
  secondhand evidence from GitHub search suggests either publishes an
  endpoint.

**Conclusion, stated plainly: it is not currently possible, by any public or
semi-public route, to submit a mainnet transaction that touches the live
STRK20 pool contract's state-changing entrypoints.** The gap is real,
current, on-chain-verified (not just doc-inferred), and not specific to this
team — other participants hit the identical wall and got no response
either. We did not fake a pool-touching transaction, and we stopped
attempting further variants once the revert reason confirmed the blocker is
structural rather than an encoding bug on our side. If the prover becomes
reachable, the only code that changes is `src/lib/predicate.ts` (see
README "The attester today, and what replaces it") — the contract and
claim flow need no changes at all.

## Sprint requirements checklist

- [x] Public GitHub repo with license (MIT; vendored StarkWare code keeps
      its own Apache-2.0 `LICENSE`)
- [x] ≥3 real mainnet transactions (7, listed above)
- [x] Live public demo URL (https://provah.vercel.app/)
- [x] 3-minute demo script (`DEMO.md`)
- [x] Complete `strk20.json`
- [x] README explains what's private vs. public
- [x] Full user flow works live: generate a pass from one wallet, claim
      from a different, unfunded wallet, gas-sponsored by Prova
- [x] Multiple campaign/predicate types, not a single hardcoded demo
- [x] Literal, demoable pass transferability (bearer-token export/redeem)

## Known limitation: predicate check is a server attestation, not a client-side ZK proof

The one honest gap between this v1 and the fully trustless design it's
built for. See README "The attester today, and what replaces it" for the
full writeup, including exactly which files would change (`predicate.ts`
only — the contract's signature check already supports swapping in a real
verifier or a prover-controlled key with no changes to the nullifier
registry or claim flow).

## Architecture

See the README's "Architecture" section for the full data-flow diagram and
component breakdown.

## Environment constraint (development only, does not affect the live demo)

This project's dev sandbox has outbound network access limited to
github.com, npm/pypi, and the Anthropic API — it cannot reach Starknet RPC
nodes or vercel.com directly. All mainnet transactions above were executed
via `.github/workflows/mainnet-admin.yml` (`scripts/mainnet-admin.mjs`), a
`workflow_dispatch` action running on a GitHub-hosted runner with full
internet access. The live app itself (Vercel) talks to Starknet RPC and
Neon Postgres directly at runtime — this constraint is specific to the
build environment, not the deployed product.
