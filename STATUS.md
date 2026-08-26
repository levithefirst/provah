# Prova Pass — build status

Last updated: 2026-08-26

## LIVE on Starknet mainnet
- Operating account (OpenZeppelin single-signer, no guardian):
  `0x3b8fa185523ff035d5df73c55859a264ec39e3c72f8cb49fc2ee306ee842ede`
  — deploy_account tx `0x266ff30feda87e59c13eeccf122af1d82aaf92088d95cf7dcbff91f44c3c010`
- `ProvaPass` contract: `0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402`
  (class hash `0x7adfeaf0d075cda33b3128fd9cc255e34e7b778e907cbb64216d76bd7cf89e6`)
  — declare tx `0x1d57d647ff240ff4c02d9fb255bbaf80bc5238f8091483f33505c0ca3011153`,
  deploy tx `0x79375d773a91d5726a9bf896e114bc7549003f05c7decd685a0bce5b47dc70a`
- Campaign "STRK Loyalty Drop" created — invoke tx
  `0x758de909a13df099cd72a1ef843217805d04ab761ab57e2bcd4c0f924c126e6`
- A pass claimed from a wallet unrelated to the qualifying holder — invoke tx
  `0x5ebf464f06bfe864f2ee875a4b8a84ab8032b31ced539300424067ae14f9dce`

All 5 transactions are real, confirmed mainnet transactions (see `strk20.json`).
Note: the old Argent operating wallet
(`0x031676cdcf7fbfd07e73c420780d4efb51ba8778dc1c29db0c9527d1dd9a4a07`) was
abandoned mid-build after its guardian could not be cleanly removed — it is
no longer used for anything except as a demo claim-recipient address above.

## Confirmed facts (from official sources)
- STRK20 privacy pool is live on Starknet mainnet at
  `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`
  (chain `SN_MAIN`, RPC `https://rpc.starknet.lava.build:443/rpc/v0_9`).
- Real, working TypeScript SDK: `@starkware-libs/starknet-privacy-sdk`
  (github.com/starkware-libs/starknet-privacy). No public npm registry
  publish found — built from source and vendored into `vendor/` (Apache-2.0,
  original LICENSE preserved).
- **Gap found (documented, not worked around):** every state-changing call
  to the pool contract (deposit, register, transfer, withdraw) can only be
  submitted through a `starknet_proveTransaction` JSON-RPC proving service —
  the pool contract has no plain invoke path (confirmed by reading
  `packages/privacy/src/interface.cairo`: the only external entrypoints are
  `IViews` (read-only) and `IAdmin` (owner-only); everything else routes
  through `__execute__`/`compile_actions`, which requires zero-caller
  invocation only reachable via the prover/relayer). That proving service's
  mainnet URL is not published anywhere reachable: not in the hackathon
  repo, not in the starter kit, not in StarkWare's own reference demo
  (`demo/.env.mainnet.example` ships it as `TODO_MAINNET_PROVER_URL`), and
  the prover itself isn't open-sourced in `starknet-privacy` (only the
  discovery-indexer is — the transaction prover is a separate container
  image, `ghcr.io/starkware-libs/starknet-privacy/transaction-prover`, that
  additionally requires a full synced Pathfinder mainnet node as a
  dependency — a multi-day infra build on its own, not something feasible
  to stand up from scratch in this session).

## Architecture decision (v1)
See README "What is private / what is not" for the full reasoning. Summary:
- **Public, on-chain, real:** STRK20 deposit events (already public by the
  pool's own design), our own `ProvaPass` Cairo contract (campaigns +
  nullifier registry), and claim transactions against it.
- **Server-attested (until a hosted/self-run prover exists):** the
  predicate check itself. The `ProvaPass` contract still trustlessly
  enforces one-time use and campaign/recipient binding via an on-chain
  ECDSA check + nullifier registry — only the predicate evaluation is a
  server attestation rather than a client-side ZK proof.

## Live diagnostic (2026-08-25, via `mainnet-admin.yml` → `balance` action)
`STARKNET_ACCOUNT_ADDRESS` (`0x031676cdcf7fbfd07e73c420780d4efb51ba8778dc1c29db0c9527d1dd9a4a07`)
is **not deployed on Starknet mainnet** — `starknet_getNonce` returns
`"Contract not found"` and its ETH balance is `0x0`. This, not a missing
env var, is why the `deploy` action's declare transaction failed
(`Account validation failed: ... exceed balance (0)`). Needs: STRK (or
ETH) sent to that address on mainnet, and a `deploy_account` transaction
(automatic on first send from Argent X / Braavos with the same private
key, or can be submitted directly once funded).

## Progress
- [x] Repo scaffold (Next.js/TS/Tailwind, App Router)
- [x] Cairo `ProvaPass` contract written + compiles (Scarb 2.9.2)
- [x] Neon schema created (campaigns, prova_passes, claims, activity log)
- [x] Real Privacy SDK vendored and import-tested
- [x] Server routes: `/api/campaigns`, `/api/pass`, `/api/claim`,
      `/api/admin/deploy`, `/api/admin/create-campaign`
- [x] Frontend (connect wallet A → generate pass → connect wallet B →
      claim), builds clean (`npm run build`, `tsc --noEmit`)
- [x] GitHub Actions workflow (`mainnet-admin.yml`) as a mainnet-execution
      path independent of the Vercel git-link issue below
- [x] GitHub Actions repo secrets set by the repo owner
      (`STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`,
      `PROVA_ATTESTER_PRIVATE_KEY`, `PROVA_ATTESTER_PUBLIC_KEY`)
- [x] Executed 5 real mainnet transactions (deploy_account, declare, deploy,
      create-campaign, claim) — see "LIVE on Starknet mainnet" above and
      `strk20.json`.
- [ ] Confirm the public Vercel URL (`https://provah.vercel.app/`) reflects
      the live contract addresses above — Vercel deployment status was not
      independently re-verifiable from this session's tools.
- [ ] Real transactions that touch the STRK20 pool contract itself remain
      blocked on the missing prover endpoint above; if you have access to
      the hackathon's Telegram/Discord support channel, that's the
      remaining unknown.

## Known environment constraint
This dev sandbox's outbound network is allowlisted to github.com, npm/pypi,
and the Anthropic API only — it cannot reach Starknet RPC nodes, vercel.com,
or most other domains directly. Real mainnet calls run either from the
deployed Vercel app or from `.github/workflows/mainnet-admin.yml`
(`scripts/mainnet-admin.mjs`) on a GitHub-hosted runner.
