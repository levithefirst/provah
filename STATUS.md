# Prova Pass — build status

Last updated: 2026-08-25

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
- [ ] **Blocked on repo maintainer action:** Vercel project for this repo
      keeps failing to link via the API (`create_git_project` creates a
      project but the GitHub link 404s immediately after — tried 3x with
      different project names, same result). This looks like Vercel's
      GitHub App not being authorized for `levithefirst/provah`. Needs a
      human to import the repo from the Vercel dashboard once (which
      triggers the GitHub App auth flow), or to fix the existing stuck
      project's Git connection in its Settings.
- [ ] **Blocked on repo maintainer action:** no MCP tool exists to set
      Vercel env vars or GitHub Actions secrets from this session. Needs
      `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`,
      `PROVA_ATTESTER_PRIVATE_KEY`, `PROVA_ATTESTER_PUBLIC_KEY`, and
      `DATABASE_URL` set as either Vercel project env vars or GitHub
      Actions repo secrets (see `.env.example`) before any real mainnet
      transaction can run.
- [ ] Execute ≥3 real mainnet transactions (deploy, create-campaign,
      claim) once the above is set — will populate `strk20.json`.
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
