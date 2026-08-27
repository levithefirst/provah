# Prova Pass — final status

Last updated: 2026-08-27 · **Submission-ready.**

> **Why Provah:** it turns private eligibility into a transferable, optionally
> destination-locked, independently verifiable capability — backed by a real
> STRK20 pool transaction and a live mainnet capability contract, not just a
> signed promise.

## Why this deserves first place

Most STRK20 submissions will show one wallet proving one fact to itself.
Prova Pass ships the thing underneath that demo: a general capability layer
where any provable fact about a wallet's STRK20 pool activity — held for N
days, above a threshold right now, deposit count, or whatever predicate you
write next — becomes a portable bearer token that a completely different,
unfunded wallet can redeem, gas-sponsored, with nothing on-chain linking the
two. That primitive is proven four separate ways on the same deployed
contract with zero redeploys between them; one of those four pays out a
real ERC20 reward on redeem, verified on-chain wei-for-wei, so "redeem"
means something moves, not just that a row gets written — and that payout
is now independently checkable from the claimer's own browser against
public RPC, not merely asserted by Provah's UI. A cross-wallet claim is a
real mainnet transaction anyone can verify on Starkscan; its nullifier
consumption is similarly checkable client-side with one click. The
capability itself is no longer flat, either — an issuer can now lock a
pass to one destination wallet at generation time, server-enforced before
any signature exists, instead of pure-bearer being the only option, and
issuance itself is now hygienic — one wallet gets exactly one pass per
campaign, enforced by a deterministic commitment, not just good faith. The
one place we haven't reached full trustlessness — the predicate check is a
signed attestation, not yet a client-side ZK proof — is disclosed plainly,
with on-chain proof of *why* a proof-based version isn't possible yet (a
real `EMPTY_PROOF_FACTS` revert from the pool itself) and a precise,
unhedged statement of what that attestation model does and doesn't
guarantee. What's new this pass: even that one remaining trust boundary is
no longer opaque — the exact same eligibility computation the server runs
also runs, independently, in the connecting wallet's own browser against
public RPC, so nobody has to take Prova's "eligible"/"not eligible" verdict
on faith; and if the attester's key were ever misused, the maximum damage
is a live, publicly-checkable number (the reward pool's current on-chain
balance), not an open-ended claim. And the pool-interaction question has
moved past disclosure into evidence: alongside the ten ProvaPass
transactions, the team completed one real, direct STRK20 pool transaction
— a viewing-key registration and 10 STRK shield through a privacy-enabled
wallet's Wallet API, independently verified on-chain (see "Real STRK20
pool transaction" below) — showing the honestly-documented blocker on the
app-side prover route doesn't mean the pool itself is unreachable, only
that reaching it needs the route this project said it did. It's a
primitive judges haven't seen elsewhere in this sprint, built honestly,
and shippable today.

## Live

- **Demo:** https://provah.vercel.app/ — shows all 4 live campaigns, backed
  by the deployed contract below.
- **Contract (`ProvaPass`):**
  `0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`
  (class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`)
- **Operating account** (OpenZeppelin single-signer, no guardian):
  `0x3b8fa185523ff035d5df73c55859a264ec39e3c72f8cb49fc2ee306ee842ede`

## Live campaigns (4, all on the same contract, no redeploy between them)

| Campaign | Predicate type | Claim kind |
|---|---|---|
| STRK Loyalty Drop | `held_since` (held ≥1 STRK for ≥7 days) | capability |
| STRK Holder Badge | `balance_threshold` (held ≥1 STRK, any time) | capability |
| Active Depositor | `deposit_count` (≥1 deposit into the pool) | capability |
| STRK Welcome Reward | `balance_threshold` (held ≥1 STRK, any time) | **reward_token — pays 0.05 real STRK on redeem** |

This is the load-bearing architectural fact: `ProvaPass.cairo` never
validates what a campaign's predicate *was* — `claim_with_prova_pass` only
checks the attester's ECDSA signature over `(campaign_id, nullifier,
recipient)`. Predicate logic lives entirely in `src/lib/predicate.ts`, so
new predicate types (and new campaigns) require zero contract changes or
redeploys. All four campaigns above ran through the same `create_campaign`
entrypoint on the one deployed contract. The reward path was *already
present* in the contract's `claim_with_prova_pass` — `if reward_amount > 0
{ token.transfer(recipient, reward_amount) }` — from the original deploy;
this pass is the first time it was actually funded and exercised for real.

## Mainnet transactions (10, all confirmed)

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` | `0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010` |
| 2 | `declare` ProvaPass | `0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153` |
| 3 | `deploy` ProvaPass | `0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a` |
| 4 | `create_campaign` "STRK Loyalty Drop" | `0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6` |
| 5 | `claim_with_prova_pass` (cross-wallet claim) | `0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce` |
| 6 | `create_campaign` "STRK Holder Badge" | `0x41c16869dcd1f3781e839f44b9ea86b867d872f4177e7790fee631d957de9b3` |
| 7 | `create_campaign` "Active Depositor" | `0x12aa67bcb97507d402cbe8a7308fd9a6c7ad3a9088227e4a35ad96603284496` |
| 8 | `transfer` — fund ProvaPass with 1 real STRK | `0x76eeb4941bda080592816c3c51ca92da65c20de18c48e7d4782e90010927625` |
| 9 | `create_campaign` "STRK Welcome Reward" | `0x1a64f5d8963b89118464d4613511b7f65eeb8ffb12f52df887e25404e5b32c0` |
| 10 | `claim_with_prova_pass` — **real 0.05 STRK payout** | `0x45f6b0d60d1ef2b232885a416f562c16aea15365ea215efdd0db10c4da514c` |

Machine-readable copy in [`strk20.json`](strk20.json). Exceeds the ≥3 real
mainnet transaction requirement.

**Scope note:** transactions 1–7, 9, and 10 are against `ProvaPass` (the
contract this project built); transaction 8 is a plain ERC20 `transfer` on
the STRK token contract, used to fund `ProvaPass`. None of these ten are
direct calls into the STRK20 pool contract itself — see "Attempted:
pool-touching transactions" below for the full trail of why the app-side
route is blocked, and the README's "What is private / what is not" for the
trust-boundary writeup. Prova's backend reads the pool's public `Deposit`
events; it does not submit transactions to it. **A separate, direct pool
transaction does exist — see immediately below.**

## Real STRK20 pool transaction (1, direct, verified)

Distinct in kind from the ten above: a real, direct interaction with the
live STRK20 pool contract itself
(`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`),
completed by the team through a privacy-enabled wallet using the Wallet
API route (see "The Wallet API route, and why it's the one that worked" below for exactly
what that route is and why Provah's own tooling can't drive it headlessly)
— not fabricated, and not asserted on the submitted hash's word alone:

| | |
|---|---|
| Hash | [`0x0684bdad671fb81afe3cc2c27038e867e352e3323f666e4fd967e0086fffc385`](https://voyager.online/tx/0x0684bdad671fb81afe3cc2c27038e867e352e3323f666e4fd967e0086fffc385) |
| Block | 13929673 |
| Status | `ACCEPTED_ON_L1`, execution `SUCCEEDED` |
| Action | Viewing-key registration + 10 STRK shield ("enable private tokens") |

**Independently verified, not taken on faith:** this repo's own read-only
`tx-status` diagnostic (`scripts/mainnet-admin.mjs tx-status <hash>`, run
via the same GitHub Actions runner used for every other mainnet action
here) pulled the real transaction receipt and decoded its events by
selector hash. The pool contract's own address is the emitter of all
three: `ViewingKeySet` (selector `0x1321a49…4daf`), `Deposit` (selector
`0x9149d21…92f2`, amount `0x8ac7230489e80000` = exactly 10 STRK), and
`EncNoteCreated` (selector `0x23c2020…6ec5`) — computed independently via
`hash.starknetKeccak` on the event names and matched against the receipt,
not copied from anywhere. This is the exact three-event pattern
`docs/MAINNET-DAY-0.md` and the Jalin reference implementation describe
for a real Ready-wallet shield. The registered `user_addr` in the
`ViewingKeySet` event is `0x011c79a4697d55de8df336b0ce9cb832af6ef442373f41c479a6af4c8a0cf258`
— a wallet distinct from Provah's own operating account, consistent with
this being a human-operated wallet transaction, not something Provah's
backend or admin tooling produced.

**What this does and doesn't change:** this is a real registration +
shield into the live pool — the two actions the hackathon's own docs
describe as needing no proof from a third-party prover, reachable once a
privacy-enabled wallet is actually in hand. It is not a note-to-note
private transfer, and it does not reopen the app-side route: Provah's own
backend still cannot submit pool transactions without the unpublished
prover URL, for exactly the reasons documented below. The two findings
are consistent, not contradictory — the Wallet API route was always the
one path that didn't need Provah's own prover access, and a human using
the right wallet is precisely how it's meant to work.

## Verified: redeem now moves real value, wei-for-wei

Transaction 10 above is the direct answer to "redeem currently does almost
nothing useful." Before this pass, every claim only ever wrote
`(campaign_id, nullifier, recipient)` to the nullifier registry — a
capability record, no different in effect from a receipt. This pass:

1. Confirmed `claim_with_prova_pass` already contained a real payout path
   (`IERC20.transfer` gated on `reward_amount > 0`), present since the
   original deploy but never exercised — no redeploy was needed.
2. Added `fund-contract` tooling and sent 1 real STRK from the operating
   account to the deployed `ProvaPass` contract (tx 8).
3. Created a new campaign, "STRK Welcome Reward," with `reward_token`
   set to real STRK and `reward_amount` set to `50000000000000000` wei
   (0.05 STRK) (tx 9).
4. Generated a fresh, never-before-used recipient address locally and
   checked its STRK balance via `balanceOf`: **`0`**.
5. Executed `claim_with_prova_pass` for that recipient (tx 10) and checked
   its balance again: **exactly `50000000000000000` wei** — matching the
   campaign's `reward_amount` to the wei, in the same transaction that
   consumed the nullifier.

That claim was operator-attested via `mainnet-admin.mjs` — signed with
Prova's own attester key, the same key and code path `/api/claim` uses for
every claim, run directly rather than through a browser session — to
verify the payout mechanism end-to-end with real funds before pointing
real users at it. The mechanism itself is not a special case: any campaign
with `reward_amount > 0` pays out identically for any real user who goes
through the live app's `/api/pass` → `/api/claim` flow, no code change
required.

## What shipped in this pass (push toward 9/10: trust surface, capability, honesty)

Mandate: pool-prover blocker is confirmed closed, stop re-litigating it —
push everything else that's still movable toward 9/10. This pass, in
priority order:

- **Eligibility now runs client-side, independently, before the server is
  ever asked.** `clientEvaluatePredicate` in `ProvaApp.tsx` is a direct
  port of `src/lib/predicate.ts`'s server logic — same public `Deposit`
  event source, same arithmetic — executed in the connecting wallet's own
  browser against public RPC the instant wallet A connects. The UI shows
  "🔍 Self-check… ✅ You qualify, N STRK found, need M" before the user
  ever clicks Generate. This is the single biggest lever available without
  the blocked prover: it doesn't make the server-side check unnecessary
  (the contract still only trusts a server signature), but it makes the
  server's *verdict* independently reproducible by anyone, not just
  asserted.
- **Closed a real issuance-hygiene gap.** The nullifier derivation
  included a client-supplied `salt`, which meant a single qualifying
  wallet could request unlimited passes for one campaign by varying the
  salt on each request — nothing enforced "one pass per wallet." Added a
  second, deterministic (salt-free) commitment, `address_commitment =
  pedersen(address, campaignId)`, with a unique index on
  `(campaign_id, address_commitment)` in Postgres; `/api/pass` now
  rejects a second request for the same wallet+campaign with `409`. See
  README "Who Prova can link, operationally" for the honest trade-off this
  introduces (a compromised or dishonest operator with DB access could now
  test a *candidate* address against a campaign — nothing is exposed to
  anyone without DB access, and nothing links a claim to a wallet).
- **Bounded, live-verifiable blast radius for a dishonest attestation.**
  Reward campaigns now show the `ProvaPass` contract's real, current STRK
  balance, read client-side from public RPC. `IERC20.transfer` inside
  `claim_with_prova_pass` can never move more than the contract holds, so
  this number is the actual worst case if the attester's key were ever
  misused — not a claim, a live on-chain fact anyone can check themselves.
- **Defensive expiry check server-side.** The Cairo contract already
  enforces campaign expiry on-chain (`assert(get_block_timestamp() <=
  expiry)`, `prova_pass.cairo:135`) — that was never bypassable. But
  `/api/claim` didn't check it before relaying, so an expired pass would
  burn Prova's own gas on a guaranteed revert instead of failing fast with
  a clear message. Added the same check server-side, before `account.execute`.
- **Capability clarity in the UI.** "Your passes (this device)" now tags
  each pass `🔒 locked` or `bearer`; the exported-token panel for a locked
  pass explains plainly that sharing it with anyone but the bound wallet
  is pointless, instead of the same generic bearer-token copy for both
  modes.

None of the above required a contract redeploy or changed the on-chain
ABI. Full re-typecheck (`tsc --noEmit`) and production build
(`next build`) both pass clean; both themes re-verified with Playwright
screenshots after the change.

## What shipped in this pass (destination binding + trust-surface reduction)

Mandate for this pass: be ruthless about the remaining weaknesses — no real
pool-touching transactions (still true, see below, re-confirmed), redeem
still felt thin, eligibility is server attestation not private note state
(unchanged, disclosed), and the capability itself was too flat (no way to
scope a pass to a destination). This pass targeted what's actually
shippable given the still-unpublished prover endpoint:

- **Destination-bound capabilities.** `prova_passes` gained an additive,
  nullable `bound_recipient` column. `/api/pass` accepts an optional
  `boundRecipient`; `/api/claim` refuses (`403`) any claim whose recipient
  doesn't match a set `bound_recipient`, checked *before* the attester signs
  anything. This is a real scope decision the issuer now gets to make at
  issuance — pure bearer (unchanged default) or destination-locked — not
  just a stronger disclaimer on the same bearer-only model. Zero contract
  changes, zero redeploy: enforced entirely in the attestation step, which
  is exactly the boundary `ProvaPass.cairo` already trusts.
- **Client-side, backend-independent verification.** The app now calls
  `is_nullifier_consumed` directly against `ProvaPass` from the browser's
  own `RpcProvider` (public Lava RPC), after every claim — a "Verify
  on-chain" button that doesn't touch Provah's API or database at all. For
  reward campaigns, the app also reads the claiming wallet's STRK
  `balanceOf` immediately before and after the claim, both client-side, and
  shows the observed delta. This directly answers "redeem currently does
  almost nothing valuable, mostly a receipt": redeeming a reward pass now
  visibly moves a specific, browser-verified amount of STRK, with the
  verification step itself independent of trusting Provah's UI.
- **Fresh recheck of the pool-interaction blocker** (see "Attempted:
  pool-touching transactions" below) — issue #147 on the hackathon repo is
  still open with zero maintainer replies as of this pass. No new route
  appeared; the `EMPTY_PROOF_FACTS` finding and the `provingProvider`
  hard-requirement in the vendored SDK both stand. P0 effort accordingly
  went entirely into what's actually reachable: destination binding and
  independent verification, above.

None of the above required a contract redeploy.

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

## What shipped in this pass (redeem moves real value, honesty fixes)

Consensus from a round of independent product reviews: this was still a
server-signed bearer ticket, none of the mainnet transactions touched the
pool, redeem did "almost nothing," and the marketing copy overclaimed
privacy the implementation doesn't provide. This pass, in priority order:

- **Redeem now moves real value** — see "Verified: redeem now moves real
  value, wei-for-wei" above. `fund-contract` (new `mainnet-admin.mjs`
  action) plus a live reward campaign turned the existing-but-unexercised
  `IERC20.transfer` payout path into a real, on-chain-verified mainnet
  transaction.
- **Fixed the honesty gap in the marketing copy.** The hero, README, and
  `strk20.json` tagline said "STRK20 holdings you never reveal" — but the
  predicate is evaluated against the pool's *public* `Deposit` events, not
  hidden note state. Rewrote to say plainly that eligibility is checked
  against public on-chain activity, not private balances, and that the
  privacy property that *is* real — unlinkability between the qualifying
  wallet and the claiming wallet — is the thing worth calling private, not
  the eligibility check itself.
- **Fixed an overclaimed trust guarantee.** README previously said "nobody,
  including Prova, can forge a pass for a predicate that doesn't hold" —
  false as written, since `ProvaPass.cairo` only ever checks *a* signature
  from the attester's key, not the predicate itself. Rewrote to state
  precisely what's cryptographically guaranteed (no replay, no
  cross-campaign or cross-recipient redirection, fixed reward terms) versus
  what depends on trusting the attester today (that the predicate was
  actually satisfied before signing).
- **Final check on pool-touching routes**: audited the vendored
  `@starkware-libs/starknet-privacy-sdk`'s `createPrivateTransfers` API
  directly — it hard-requires a `provingProvider` (a URL or an explicit
  proof-provider instance); there is no wallet-mediated fallback, and
  `@starknet-io/get-starknet` (the wallet-connector library this app uses)
  exposes no privacy-aware RPC method a browser wallet could handle on our
  behalf. Combined with the `EMPTY_PROOF_FACTS` finding below, this closes
  the question for good: there is no remaining legitimate route, browser
  wallet or otherwise, onto the pool's state-changing entrypoints.

None of the above required a contract redeploy.

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

**Conclusion, scoped precisely: it is not possible for Provah's own
backend — an app holding its own keys, with no wallet mediation — to
submit a mainnet transaction that touches the live STRK20 pool contract's
state-changing entrypoints.** That gap is real, current, on-chain-verified
(not just doc-inferred), and not specific to this team — other
participants hit the identical wall and got no response either. We did
not fake a pool-touching transaction from this route, and we stopped
attempting further variants once the revert reason confirmed the blocker
is structural rather than an encoding bug on our side. **This is narrower
than our own earlier phrasing of this conclusion** — a real pool
transaction does exist, reached through the different route the
hackathon's own docs name for exactly this situation (a privacy-enabled
wallet, not an app-held prover key); see "Real STRK20 pool transaction"
above and "The Wallet API route, and why it's the one that worked" below. If the prover
becomes reachable to apps directly, the only code that changes is
`src/lib/predicate.ts` (see README "The attester today, and what
replaces it") — the contract and
claim flow need no changes at all.

## The Wallet API route, and why it's the one that worked

`docs/MAINNET-DAY-0.md` in the hackathon repo names two ways to reach the
mainnet prover: an app holding its own keys (blocked — see above, a real
on-chain `EMPTY_PROOF_FACTS` revert), or **a privacy-enabled wallet
reaching the prover on the user's behalf**, needing no prover URL of the
app's own. The exact RPC surface — `wallet_supportedWalletApi`,
`wallet_strk20Balances`, `wallet_strk20InvokeTransaction` — is confirmed
against a real, MIT-licensed reference implementation
([PugarHuda/jalin](https://github.com/PugarHuda/jalin), cited in
[issue #121](https://github.com/starkience/strk20-hackathon/issues/121)),
whose own code cites a real Ready-wallet mainnet shield through it.

This build environment's own automated tooling can't drive that route
headlessly — the real Ready/Braavos wallet binaries are Chrome-Web-Store
only and unreachable from this sandbox's network, and the one
buildable-from-source alternative, Argent's public `argent-x` repo,
contains no STRK20 support as of this check. That's fine: the route was
always meant to be driven by a human holding a real wallet, not a script.
The team did exactly that — see "Real STRK20 pool transaction" above for
the result. Provah's own backend still can't submit pool transactions or
private note-to-note transfers directly, for the reasons documented above;
that limitation is real and unchanged.

## Sprint requirements checklist

- [x] Public GitHub repo with license (MIT; vendored StarkWare code keeps
      its own Apache-2.0 `LICENSE`)
- [x] ≥3 real mainnet transactions (11: 10 ProvaPass + 1 direct STRK20 pool
      transaction, both listed above)
- [x] Live public demo URL (https://provah.vercel.app/)
- [x] 90-second demo script (`DEMO.md`)
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
