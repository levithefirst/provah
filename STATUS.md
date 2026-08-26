# Prova Pass — final status

Last updated: 2026-08-26 · **Submission-ready.**

## Live

- **Demo:** https://provah.vercel.app/ — shows the real "STRK Loyalty Drop"
  campaign, backed by the deployed contract below.
- **Contract (`ProvaPass`):**
  `0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`
  (class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`)
- **Operating account** (OpenZeppelin single-signer, no guardian):
  `0x3b8fa185523ff035d5df73c55859a264ec39e3c72f8cb49fc2ee306ee842ede`

## Mainnet transactions (5, all confirmed)

| # | Type | Hash |
|---|---|---|
| 1 | `deploy_account` | `0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010` |
| 2 | `declare` ProvaPass | `0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153` |
| 3 | `deploy` ProvaPass | `0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a` |
| 4 | `create_campaign` ("STRK Loyalty Drop") | `0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6` |
| 5 | `claim_with_prova_pass` (cross-wallet claim) | `0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce` |

Machine-readable copy in [`strk20.json`](strk20.json). Meets the ≥3 real
mainnet transaction requirement.

**Scope note:** these 5 transactions are all against `ProvaPass` (the
contract this project built), not direct calls into the STRK20 pool
contract — see "Known limitation" below for why, and "What is private /
what is not" in the README for the full trust-boundary writeup. Prova reads
the pool's public `Deposit` events; it does not submit transactions to it.

## Sprint requirements checklist

- [x] Public GitHub repo with license (MIT; vendored StarkWare code keeps
      its own Apache-2.0 `LICENSE`)
- [x] ≥3 real mainnet transactions (5, listed above)
- [x] Live public demo URL (https://provah.vercel.app/)
- [x] 3-minute demo script (`DEMO.md`)
- [x] Complete `strk20.json`
- [x] README explains what's private vs. public
- [x] Full user flow works live: generate a pass from one wallet, claim
      from a different, unfunded wallet, gas-sponsored by Prova

## Known limitation: predicate check is a server attestation, not a client-side ZK proof

The one honest gap between this v1 and the fully trustless design it's
built for. Evaluating "held ≥ X for ≥ N days" as a client-side ZK proof
requires submitting through STRK20's mainnet transaction-prover
(`starknet_proveTransaction`). That endpoint is not publicly documented
anywhere reachable — not in the hackathon repo, not in the starter kit, not
in StarkWare's own `starknet-privacy` reference demo, which ships the URL
as a literal unfilled `TODO_MAINNET_PROVER_URL`. The prover itself isn't
open-sourced either: it's a separate container image
(`ghcr.io/starkware-libs/starknet-privacy/transaction-prover`) that
additionally requires a fully synced Pathfinder mainnet node — a multi-day
infra build on its own, not feasible to stand up from scratch in this
build.

Until that endpoint (hosted or self-run) is wired in, Prova's backend
evaluates the predicate directly against the pool's *public* deposit
history and signs the resulting capability — a server attestation, backed
by an on-chain ECDSA check and nullifier registry, not a zero-knowledge
proof of the predicate itself. What stays trustless regardless: nobody,
including Prova, can forge a pass for a predicate that doesn't hold, replay
a pass, or bind it to the wrong campaign or recipient — `ProvaPass`
enforces all of that on-chain.

Swapping the attester for a real ZK proof once the prover endpoint exists
requires no change to the contract or the unlinkability guarantee — only
to how `/api/pass` produces its signature.

## Architecture

See the README's "Architecture" section for the full data-flow diagram and
component breakdown (contracts, vendored privacy SDK, app, API routes, DB,
mainnet execution path).

## Environment constraint (development only, does not affect the live demo)

This project's dev sandbox has outbound network access limited to
github.com, npm/pypi, and the Anthropic API — it cannot reach Starknet RPC
nodes or vercel.com directly. All mainnet transactions above were executed
via `.github/workflows/mainnet-admin.yml` (`scripts/mainnet-admin.mjs`), a
`workflow_dispatch` action running on a GitHub-hosted runner with full
internet access. The live app itself (Vercel) talks to Starknet RPC and
Neon Postgres directly at runtime — this constraint is specific to the
build environment, not the deployed product.
