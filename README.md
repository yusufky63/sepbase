# SEPBASE

SEPBASE is an independent, single-chain onchain name registry for Base Sepolia. It registers readable names such as `alice.sepbase`, resolves them to wallet addresses, and exposes the same verified state through the dApp, SDK, React package, ABI, and read-only HTTP API.

> SEPBASE is a testnet project. It is not an official Base product or naming service, and Base Sepolia ETH has no real monetary value.

## Release profile

| Item | Value |
| --- | --- |
| Web app | [sepbase.vercel.app](https://sepbase.vercel.app) |
| Network | Base Sepolia (`84532`) |
| Contract | [`0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`](https://sepolia-explorer.base.org/address/0xe000de3efe798Aa4F834fd952Bef35BAE1B16945) |
| Contract version | `2.0.0`, non-upgradeable |
| Standard annual price | `0.0005 ETH` for 4-32 character labels |
| Short-name tiers | `100x / 25x / 5x` for 1/2/3 character labels |
| Referral reward | `10%` pull-payment reward |
| Marketplace fee | `0%` for the current deployment |
| Design direction | Modular Typography, black/white, Base Blue `#0000ff` |

> Repository/live status: current source is `Ready` on protected Preview deployment `dpl_2pEWFeWsqSestVf7n4xkZwLicAci` at `https://sepbase-fd1ancpvz-yusufky63s-projects.vercel.app`. Vercel-authenticated checks verify schema-4 discovery, OpenAPI `1.7.0`, `llms.txt`, `/me`, the current migration-aware 39-tool V3 MCP inventory and fail-closed V3/x402 routes. The Preview still builds with a localhost canonical origin because Preview environment variables are not provisioned, and the public `sepbase.vercel.app` alias remains the previous v2 web release; neither is production-promotable until the documented release gates pass.

## V3 production target

The next major version is an approved implementation and release target for Base Sepolia operated with mainnet discipline. Seven contract implementations, generated ABIs, an address-free draft manifest, V3 SDK/read-API/MCP source and local tests now exist, but **V3 is not acceptance-complete or evidenced as deployed**. The live contract and current hosted application remain v2 until the versioned cutover gates pass.

V3 supersedes the former future-version exclusions and targets:

- seven no-proxy addresses: six authority/state contracts for registry, controller, public resolver, bounded Universal Resolver helper, marketplace and migration, plus a bounded read-only MarketLens;
- ENS-compatible forward/reverse resolution, resolver text records and exact-pinned ENSIP-15 Unicode canonicalization guarded on-chain by an immutable EIP-712 normalization attestor;
- commit-reveal registration;
- fixed listings, escrowed offers/bids and English auctions;
- unified seller/referral/refund liabilities with pull claims;
- published/provenanced SDK, React and MCP npm packages with runnable CI-tested examples;
- official paid x402 V2 execution using a facilitator, durable idempotency/workflow and a limited managed keeper;
- explicit v2 migration, final HTTPS metadata cutover, multisig, independent audit and production observability.

Local source evidence and live release evidence are different. `pnpm contracts:test` currently passes 62 V3 tests within a 91/91 combined contract run, and the seven-module artifact validator is green; neither result supplies Base Sepolia V3 addresses, audit, soak or paid execution. Public npm publication and hosted-draft parity have separate evidence below and do not make V3 live. Current truth:

| Capability | Live v2 | V3 source / release target |
|---|---|---|
| Labels | ASCII `a-z0-9-` | ENSIP-15 normalized Unicode |
| Registration | Direct guarded transaction | Commit-reveal |
| Resolver | Protocol-specific address/profile | Separate ENSIP-10 public resolver + bounded ENSIP-23 simple resolve/reverse helper; no CCIP-Read/smart multicall claim |
| Marketplace | Fixed listing only | Fixed + offers + English auctions |
| x402 | Free quote in configured v2 deployments; paid POST fail-closed | Activation-gated durable official V2 paid execution after all gates |
| Packages | `@sepbase/sdk`, `@sepbase/react`, `@sepbase/mcp` `0.1.0` public with SLSA provenance | Exact public versions pass an anonymous clean-consumer TypeScript/runtime smoke; this is distribution evidence, not a deployed-V3 receipt |
| Deployment | v2 Base Sepolia | Seven-address source + address-free draft manifest; Base Sepolia deployment pending |

The attestor does not replace the normalizer or own names. Web/SDK/API/MCP use the exact pinned normalization profile and fixture corpus; the controller verifies a short-lived EIP-712 statement binding profile hash, chain, controller, normalized label hash, recipient and expiry. The commitment binds that exact attestation hash. The attestor address cannot be rotated by the owner; loss or compromise requires a reviewed controller/suite release and manifest cutover.

The draft machine-readable target is published at [`apps/web/public/deployment-manifest.v3.json`](apps/web/public/deployment-manifest.v3.json). Its null addresses and `releaseStatus: "draft"` are deliberate: ABI/config discovery is not deployment, acceptance or live evidence.

Migration eligibility can be audited reproducibly with `V3_MIGRATION_SOURCE_BLOCK=44054186 pnpm migration:v3:dry-run`; the checked report is `evidence/v3-migration/84532-44054186.json` (6/6 active v2 names eligible at that block, embedded `reportSha256` `492ab72338895dc101b3ce4b0b4bb1971d7521fd9797c28ddb20882ded5b4551`). This fixed-block report is preflight only: no V3 deployment, claim transaction or cutover has occurred.

Start with [V3 Architecture](docs/V3_ARCHITECTURE.md), [V3 Threat Model](docs/THREAT_MODEL_V3.md), [V3 Web UX](docs/V3_WEB_UX.md), [hood.ag Comparison](docs/HOOD_COMPARISON.md), [Marketplace/Referral/Proceeds Guide](docs/USER_MARKETPLACE_GUIDE.md), [Migration Plan](docs/MIGRATION_V2_TO_V3.md), [Acceptance Matrix](docs/V3_ACCEPTANCE_MATRIX.md), and [Transaction Evidence](docs/TRANSACTION_EVIDENCE.md).

The shared implementation does not assume ETH, wei, 18 decimals, a token address, a suffix, or a chain ID. Gas currency and settlement asset are separate configuration values. A cloned deployment can settle in its native currency or one standard ERC-20 using manifest-declared base-unit precision.

## Features

- ERC-721 name ownership with active, grace, released, reserved, and available lifecycle states
- Configured annual pricing with guarded 1-5 year registration and renewal
- Automatic configured-chain switching before registration with a manual retry fallback
- Chain-aware registration network-fee estimation, including OP Stack L1/L2 fees
- Optional cached USD market reference display that never changes protocol quotes or write guards
- Forward resolution, forward-confirmed primary names, and public profiles
- Onchain referral attribution with claimable pull-payment rewards
- Fixed-price settlement-asset marketplace with seller pull payments
- Device-local renewal watch, in-app expiry warning, and ICS calendar export
- Wallet-gated account workspace combining names, referrals, listings, and proceeds
- Allowlist-gated admin workspace backed by live contract authorization
- Manifest-first TypeScript SDK and React identity component
- Separate stateless MCP surfaces: current-v2 `/api/mcp` and opt-in V3 `/api/v3/mcp`, plus local stdio support; neither signs or broadcasts
- Free v2 quotes plus an activation-gated V3 paid runtime: official x402 V2 negotiation, encrypted plan/idempotency storage, managed signing, on-chain reconciliation, and Workflow DevKit continuation are wired; the current draft release remains unavailable
- ABI, OpenAPI, agent discovery, metadata/image routes, `llms.txt`, and Blockscout BENS handoff documentation

## Application routes

| Route | Purpose |
| --- | --- |
| `/` | Search, pricing, platform health, and recent registrations |
| `/name/[label]` | Availability, registration, renewal, profile, transfer, and listing actions |
| `/me` | Names, referrals, listings, proceeds, and renewal summary |
| `/market` | Fixed-price marketplace discovery and purchase flow |
| `/developers` | SDK, React, ABI, API, manifest, and guarded write documentation |
| `/admin` | Authorized protocol health, activity, and owner controls |
| `/api/market-reference` | Optional cached UI-only settlement market reference |
| `/api/mcp` | Legacy/current-v2 stateless MCP endpoint with eight read/preparation tools |
| `/api/v3/mcp` | Opt-in 39-tool V3 MCP endpoint with bounded V3 reads and unsigned plans; registration is requirements-only and no secret/signature/payment payload is accepted |
| `/api/v3/normalization-attestation` | Same-origin, candidate/live-only proxy to a reviewed external issuer; draft state fails before issuer configuration or I/O |
| `/api/v3/status` | Public V3 draft/candidate/live discovery; currently reports seven null deployment addresses |
| `/api/v3/name/[label]`, `/api/v3/resolve/[label]`, `/api/v3/reverse/[address]`, `/api/v3/account/[address]`, `/api/v3/market`, `/api/v3/health` | V3-only block-pinned reads that fail closed until the draft manifest is replaced by a verified deployment; account reads keep unavailable data distinct from zero balances |
| `/api/x402/registration/quote` | Free canonical agent registration quote |
| `/api/x402/registration` | Activation-gated V3 paid route: `402` negotiation, `202` durable workflow enqueue, `200` settled replay; current draft/live-capability mismatch returns `503` before parsing payment material |
| `/security` / `/privacy` | Responsible disclosure and browser/public-chain data notices |

## Architecture

```text
Next.js dApp / SDK / React / HTTP API / MCP
                       |
                       v
            deployment-manifest.json
                       |
                       v
           ChainNameService.sol (v2.0.0)
                       |
                       v
                Base Sepolia RPC

Disabled x402 execution scaffold -- limited keeper --^
(source runtime is wired; the current draft release remains activation-gated and fail-closed)
```

The contract is the source of truth. The application has no required database or indexer. API responses pin related reads to one block, and verified identity reads fail closed to the checksummed wallet address when ownership, lifecycle, primary mapping, and forward resolution do not agree. The optional market-reference route is display-only: it is cached, does not enter settlement math, and cannot change transaction availability or expected-value guards.

The V3 source does not extend the v2 box in place. It defines seven separately checksummed/versioned deployment slots: six authority/state contracts plus `ChainNameMarketLensV3`, a bounded read-only pagination helper. `ChainNameResolverV3` stores records and handles supported ENSIP-10 extended calls; `ChainNameUniversalResolverV3` is a separate registry-discovery helper limited to supported ENSIP-23 simple resolve/reverse. The lens is not market authority or an indexer: consumers pin one block, respect its 50-result/100-scan bounds, follow the raw cursor, deduplicate IDs, and revalidate authoritative state before writes. Local source/tests do not make any V3 surface deployed or fully ENS-conformant.

## Repository layout

```text
apps/web/          Next.js App Router dApp and read-only API
contracts/         Foundry contract, deployment script, unit/fuzz/invariant tests
packages/sdk/      Manifest-first TypeScript SDK
packages/mcp/      MCP Streamable HTTP/stdio server and guarded tool definitions
packages/react/    React provider, hook, and verified identity component
deployments/       Reviewed public Base Sepolia deployment records
docs/              Deployment, operations, security, and readiness documentation
scripts/           Validation, manifest, deployment, smoke, and release tooling
```

## Local development

Requirements:

- Node.js `22.14.0+`
- pnpm `11.7.0+`
- Foundry with Solidity `0.8.36` support

```bash
pnpm install --frozen-lockfile
pnpm project:validate
pnpm deployment:check
pnpm dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env` for local configuration. Never commit `.env` or expose provider credentials through `NEXT_PUBLIC_*` variables.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_RPC_URL` | Public | Browser-safe chain RPC published in the manifest |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical site origin |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Public | Optional locally; required by the production release gate |
| `NEXT_PUBLIC_ADMIN_ADDRESSES` | Public | Additional read-only admin viewers |
| `RPC_URL` | Server only | Authenticated hosted API RPC; never browser-visible |
| `SEPBASE_MANIFEST_URL` | MCP stdio | Canonical public manifest URL for a local agent host |
| `SEPBASE_RPC_URL` | MCP server only | Optional private RPC override; never published |
| `X402_REGISTRATION_ENABLED` | Server only | One required activation gate; never sufficient without a live paid-enabled V3 manifest and every external runtime/evidence gate |
| `X402_QUOTE_TTL_SECONDS` | Server only | Optional free-quote lifetime, bounded to 15-300 seconds |
| `X402_FACILITATOR_URL` | Server only | Reviewed official-x402 facilitator endpoint used only after the activation gate passes |
| `X402_PAY_TO_ADDRESS` / `X402_PAYMENT_ASSET_ADDRESS` | Server only | Exact receiver/asset bindings; the asset must equal immutable ERC-20 protocol settlement |
| `X402_KEEPER_ADDRESS` / `X402_KEEPER_SIGNER_PROVIDER` | Server only | Limited keeper identity and external managed signer reference; raw keys are forbidden |
| `X402_IDEMPOTENCY_STORE_URL` | Server only | Authenticated encrypted CAS for durable payment-ID/order and secret-plan state |
| `SOURCE_COMMIT` | Build only | Optional explicit 40-character source SHA for generated provenance |
| `PRIVATE_KEY` | Deployment only | Foundry deployment/operations; never required by the web app |
| `OWNER_ADDRESS` / `TREASURY_ADDRESS` | Deployment only | Deployment role checks |

`NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS` is required only for an ERC-20 settlement profile. It must remain empty for the current native-settlement deployment.

## Validation

```bash
pnpm exec tsx scripts/forge.ts fmt --check --root contracts
pnpm contracts:build
pnpm contracts:sizes
pnpm contracts:test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

Current verified baseline:

- Solidity: `91` tests passing (`62` V3 + `29` historical v2)
- SDK: `55` tests passing
- MCP: `34` tests passing
- React package: `4` tests passing
- Web: `229` tests passing across `71` files
- Historical v2 contract runtime: `24,502 B` with `74 B` remaining below EIP-170; separate V3 modules pass the local size gate
- V3 artifacts: seven modules validated; one positive and ten fail-closed validator cases pass
- Production dependency audit: no known vulnerabilities
- SHA-pinned GitHub CI covers frozen install, artifact validation, application checks, the complete Foundry suite, and an opt-in live deployment check

The funded Base Sepolia write smoke is intentionally separate because it broadcasts transactions and spends testnet funds:

```bash
pnpm smoke:base-sepolia
```

## Integration

Start with the deployment manifest and validate its ABI checksum and contract version before reading names:

```text
/deployment-manifest.json
/deployment-manifest.v3.json          # source/draft target; not deployment evidence
/.well-known/chain-name-service.json
/.well-known/chain-name-agent.json
/abi/ChainNameService.json
/api/openapi.json
/api/v3/status                        # returns draft state until deployment
/api/v3/name/{label}                  # fails closed while draft addresses are null
/api/v3/resolve/{label}
/api/v3/reverse/{address}
/api/v3/account/{address}
/api/v3/market
/api/v3/health
/api/mcp                              # current-v2 MCP surface
/api/v3/mcp                           # opt-in V3 surface; draft-dependent calls fail closed
/api/v3/normalization-attestation     # candidate/live only; verified external issuer, no local signer
/api/x402/registration/quote
/llms.txt
```

Public packages:

```bash
pnpm add @sepbase/sdk@0.1.0 @sepbase/react@0.1.0 @sepbase/mcp@0.1.0
```

The three packages were published from GitHub Actions run `29246721839` with npm provenance and then installed anonymously at exact version `0.1.0` into an isolated strict-NodeNext consumer. Registry integrity, provenance URLs, runtime imports and the exact release source are recorded in [`evidence/npm-release/2026-07-13-v0.1.0.json`](evidence/npm-release/2026-07-13-v0.1.0.json). This package release exposes the V3 source API, but deployment-dependent calls still reject the address-free draft manifest.

For current user flows and the exact differences between live v2 and v3 targets, read [Marketplace, Referrals and Proceeds](docs/USER_MARKETPLACE_GUIDE.md). Write examples are preparation/simulation fragments until an authorized wallet broadcasts; evidence of a real transaction must follow [Transaction and Release Evidence](docs/TRANSACTION_EVIDENCE.md).

MCP has no transaction authority: current-v2 `/api/mcp` may return guarded `prepare_registration` calldata/value, while opt-in `/api/v3/mcp` keeps registration requirements-only and accepts no secret/signature/payment payload; neither signs or broadcasts. Paid x402 source is now `activation-gated`: `POST /api/x402/registration/quote` prepares and encrypts the secret-bearing V3 plan, while `POST /api/x402/registration` performs official x402 V2 negotiation, durable authorization-level deduplication, managed commit/reveal signing, receipt/post-state reconciliation, and Workflow DevKit continuation. The current address-free V3 draft still returns `503` before reading request/payment material; availability requires a live paid-enabled manifest and every external runtime gate, not environment presence alone. Official `@x402/core`, `@x402/evm`, `@x402/extensions` `2.18.0` and `workflow` `4.6.0` are exact-pinned. The V3 Base Sepolia target uses manifest-verified Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals, `eip155:84532`) as both protocol settlement and x402 asset; gas remains separate test ETH and neither test asset receives a fiat valuation. The live v2 native profile is unchanged.

## Deployment status

The Base Sepolia **v2** contract is deployed, source-verified, and has passed a real multi-account registration/referral/marketplace smoke. V3 currently has local source, draft artifacts and tests only: it has no deployment addresses, verified source receipts or funded V3 transaction smoke. The hosted dApp can be deployed independently and never receives the deployment private key. The new agent/MCP/x402 quote and V3 API surfaces still require an independent web rollout and live endpoint smoke before they can be described as hosted.

The Vercel project uses `apps/web` as its Root Directory, includes workspace source files outside that directory, and installs dependencies from the repository-level pnpm workspace.

Before treating the project as a value-bearing mainnet release:

1. Configure a final HTTPS origin, authenticated server RPC, and WalletConnect project ID.
2. Update the onchain metadata base URI to the final hosted API and regenerate the manifest.
3. Move owner and treasury operations to a reviewed multisig.
4. Add hosted rate limiting, monitoring, and browser E2E gates.
5. Complete an independent contract and operations audit.
6. Deploy and independently review the external facilitator/CAS/signer/attestor/workflow stack, fund and bound the keeper, pass section J funded failure/replay E2E, then promote a paid-enabled live manifest; environment values alone never satisfy activation readiness.

Run `pnpm release:check` to enforce the hosted release inputs. See [Agent Integration](docs/AGENT_INTEGRATION.md), [Production Readiness](docs/PRODUCTION_READINESS.md), [Deployment Operations](docs/DEPLOYMENT.md), [Integration Guide](INTEGRATION_GUIDE.md), [Security Policy](SECURITY.md), and [Project Specification](PROJECT_SPEC.md) for the canonical details.

V3 is complete only when every required row in [V3 Full Acceptance Matrix](docs/V3_ACCEPTANCE_MATRIX.md) links to reproducible evidence. The matrix now marks the narrowly covered local V3 rows `PASS`; existing v2 smoke, adjacent local tests or source presence do not satisfy any row that remains `NOT RUN`.
