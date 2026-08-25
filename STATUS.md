# Prova Pass — build status

Last updated: 2026-08-25

## Confirmed facts (from official sources)
- STRK20 privacy pool is live on Starknet mainnet at
  `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`
  (chain `SN_MAIN`, RPC `https://rpc.starknet.lava.build`).
- Real, working TypeScript SDK: `@starkware-libs/starknet-privacy-sdk`
  (github.com/starkware-libs/starknet-privacy). No public npm registry
  publish found — vendored by building from source into `vendor/`.
- **Gap found:** no public hosted discovery-service / proving-service URL
  for mainnet exists anywhere in the official docs, the hackathon repo, or
  the starter kit — the reference demo app treats both as unfilled
  `TODO_MAINNET_*` env vars. Running a from-scratch Stwo prover + mainnet
  indexer is its own multi-day systems project. Documented as a known trust
  boundary — see README "What is private / what is not".

## Architecture decision (v1)
- **Public, on-chain, real:** shielding (deposit into the live pool),
  viewing-key registration, our own `ProvaPass` Cairo contract (campaigns +
  nullifier registry), and claim transactions.
- **Server-attested (until a hosted/self-run prover exists):** the
  "held ≥ X of asset Y for ≥ N days" predicate is evaluated by Prova's
  backend against the user-supplied viewing key, then signed as a one-time
  capability (campaign_id, nullifier, recipient). The `ProvaPass` contract
  verifies that signature and consumes the nullifier on-chain — so reuse and
  cross-campaign replay are trustlessly prevented even though the predicate
  check itself is a server attestation today, not a client-side ZK proof.

## Progress
- [x] Repo scaffold (Next.js/TS/Tailwind, App Router)
- [x] Cairo `ProvaPass` contract written + compiles (Scarb 2.9.2)
- [x] Neon schema created (campaigns, prova_passes, claims, activity log)
- [x] Real Privacy SDK vendored and import-tested
- [ ] Server routes for register/shield/predicate/pass/claim
- [ ] Deploy ProvaPass to mainnet
- [ ] Execute ≥3 real mainnet transactions, record hashes in strk20.json
- [ ] Frontend UX
- [ ] Public Vercel deploy
- [ ] README/architecture/demo script

## Known environment constraint
This dev sandbox's outbound network is allowlisted to github.com, npm/pypi,
and the Anthropic API only — it cannot reach Starknet RPC nodes or Vercel's
own domain directly. All real mainnet calls run from API routes deployed on
Vercel (full internet access there) and are triggered remotely via the
Vercel MCP tool `web_fetch_vercel_url`.
