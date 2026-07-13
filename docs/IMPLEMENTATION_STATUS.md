# Implementation Status

Last updated: 2026-07-13

## V3 target status

**The seven-contract V3 suite and reviewed 2-of-2 governance Safe are deployed on Base Sepolia, all seven contract sources are verified, the one-time registry wiring is locked, and a chain-verified candidate manifest exists; V3 is not yet live-cut-over, acceptance-complete, audited or production-ready.** The new product decision supersedes the former no-ENS/no-Unicode/no-commit-reveal/no-offer/no-auction and permanently quote-only constraints for v3. It does not change the current v2 bytecode or make a paid route live through deployment or documentation alone.

Binding v3 requirements now cover:

- seven-address no-proxy release: six authority/state contracts plus bounded read-only MarketLens, with four-argument one-time locked registry wiring and separately verified helper bindings;
- ENS-compatible registry/resolver discovery, text records, bounded ENSIP-10/ENSIP-23 simple resolution and forward-confirmed reverse; first profile has no contenthash/CCIP-Read/smart-multicall/full-official-Universal-Resolver claim;
- exact-pinned ENSIP-15 Unicode canonicalization shared by web/SDK/API/MCP plus immutable EIP-712 attestor verification in the controller;
- commit-reveal registration;
- fixed listings plus escrowed offers and English auctions;
- unified referral/seller/offer/bid/x402 refund liabilities and solvency;
- public npm SDK/React/MCP packages with compiled runnable examples;
- official x402 V2 paid execution targeting manifest-verified Base Sepolia Circle test USDC (`eip155:84532`, `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals), with separate test-ETH gas, no testnet fiat value, facilitator, durable idempotency/workflow and limited managed keeper;
- v2→v3 migration, final HTTPS metadata/discovery cutover, multisig, audit and observability.

Current v3 checklist:

- [x] V3 requirements override recorded in `PROJECT_SPEC.md`.
- [x] Target architecture, user guide, migration plan, acceptance matrix and evidence format documented.
- [x] V3 threat model and exact-pinned ENSIP-15 fixture corpus documented and locally validated; complete web/API/MCP/controller conformance evidence remains pending where the acceptance matrix says `NOT RUN`.
- [x] Seven V3 contract implementations are present in source (six authority/state + MarketLens), with immutable attestor logic, four-argument suite wiring and local Foundry coverage: 62 V3 tests pass within the 91/91 combined contract run. This is source evidence, not deployment or full acceptance.
- [x] Fixed listings, offers, auctions, MarketLens and unified controller/marketplace accounting are implemented and locally unit/edge/invariant-tested; uncovered races and browser/Base Sepolia rows remain pending.
- [x] The migration contract has local eligible-claim, owner/window guard, inclusive expiry-boundary and pre-window reservation-race tests. A fixed-block live-v2 eligibility preflight is reproducible at block `44054186`; migration deployment, claim transactions and cutover evidence remain pending.
- [x] Seven-module candidate manifest/ABI artifacts, fail-closed artifact validation, V3 SDK, V3 read API routes and opt-in V3 MCP source are present and locally tested. The candidate is bound to release ID `sha256:afd20a1a0ac6608a1ea1528c111600f4d74f5faf33b15b915cb8137598dada34`.
- [x] Deterministic Safe 1.4.1 governance account `0x4f1D07EB3BbB6c8c24f96CD5E5A14e4d53Afa630` is deployed on Base Sepolia with the reviewed two owners and 2-of-2 threshold; transaction/block evidence is versioned under `evidence/governance/`. This is governance preparation, not a V3 suite deployment.
- [x] V3 React provider/identity source and workspace SDK/Viem/Wagmi/React/MCP consumer fixture are present and typecheck locally.
- [x] V3 browser registration source now persists the exact reveal material before the wallet send, journals the transaction hash before receipt reconciliation, recovers nullable-hash commitments from same-block on-chain reads, and derives readiness/pruning only from confirmed chain timestamps. V3 referral attribution uses a release/controller-scoped cookie with self-referral removal, explicit review/clear and post-reveal consumption. Focused web evidence: 31/31 registration/session/executor/referral tests plus scoped ESLint and web TypeScript checks pass; funded browser/Base Sepolia E2E remains pending.
- [x] SDK/React/MCP are packed as real tarballs and installed into an isolated NodeNext consumer by `pnpm packages:smoke`; package export/runtime/type resolution passes outside the workspace.
- [x] `@sepbase/sdk`, `@sepbase/react` and `@sepbase/mcp` `0.1.0` are public with SLSA provenance; an anonymous exact-version clean-consumer install passes strict TypeScript and runtime import checks. Evidence: `evidence/npm-release/2026-07-13-v0.1.0.json`.
- [x] `V3_BROADCAST=false pnpm contracts:deploy:v3` passed the complete non-broadcast ceremony against Base Sepolia: Foundry format/build/size/91-test gates, seven-module artifacts, reviewed 2-of-2 Safe, configurator gas/delegation policy and Circle test USDC code/metadata all passed. No transaction was submitted. Evidence: `evidence/v3-preflight/2026-07-13.json`.
- [x] `V3_BROADCAST=true pnpm contracts:deploy:v3` deployed all seven no-proxy contracts from source commit `a2d3ac739a3ae5ccaf63fd4bc20c97b124de7c72`, and `configureSuite` locked the four stateful registry bindings. Canonical receipts span blocks `44094615`-`44094623`; all seven sources are explorer-verified with Solidity `0.8.36`; pinned-block SDK verification and five-confirmation candidate promotion passed. Evidence: `evidence/v3-deployment/2026-07-13.json`.
- [x] The production Vercel Workflow deployment reports healthy workflow and step endpoints, and the official test facilitator currently advertises x402 V2 `exact` on `eip155:84532`. This proves transport availability only; the paid CAS/signer/attestor/order runtime and funded E2E remain pending.
- [x] Encrypted CAS source is now implemented at the internal paid boundary with AES-256-GCM AAD-bound envelopes, PostgreSQL serializable transactions, authorization/plan/quote uniqueness, fencing leases, a checksum-guarded schema migration and client-protocol tests. The Neon resource, production CAS secrets and schema are provisioned and deployed; the boundary rejects unauthenticated production requests with `401 CAS_UNAUTHORIZED`. Authenticated mutation, backup/restore and distributed concurrency evidence remain pending.
- [ ] Funded V3 browser-wallet completion and Cast/runtime example coverage.
- [ ] Durable official x402 V2 service, facilitator integration and limited keeper.
- [ ] Independent audit, remediation and Base Sepolia soak.
- [ ] Full live-V3 final-origin metadata/discovery cutover, funded E2E matrix and monitored release. The address-populated candidate web/agent release and v2 metadata cutover are complete, but they are not live-V3 evidence.

Every unchecked item is pending. See `docs/V3_ACCEPTANCE_MATRIX.md`: only rows carrying explicit evidence pass. Funded V3 wallet/browser execution, paid-x402 runtime, live hosted cutover, audit, soak and operations rows remain `NOT RUN` or explicitly blocked.

## Current phase

The following is the **historical/current v2 product plus a deployed and hosted V3 candidate**, not v3 completion: the v2 Base Sepolia contract is deployed, source-verified, and exercised with a real multi-account write smoke. Its metadata base URI was cut over on-chain to `https://sepbase.vercel.app/api/metadata/` and verified after five confirmations. Production deployment `dpl_D9U98US6hoi1tyx9umf3woRwUHmi` serves the V3 candidate manifest at the canonical origin; final-origin smoke passed four pages, eight ABIs, OpenAPI/`llms.txt`, exact 8+39 MCP inventories, V3 market reads and paid fail-closed behavior. A candidate manifest does not activate the public V3 product UI: `/`, `/name/[label]`, `/me`, `/market` and referral attribution continue to use the previous v2 UX and native-ETH deployment until an explicitly promoted `releaseStatus: "live"` manifest passes the remaining gates. V3 APIs and candidate evidence remain independently available for verification. Neon/CAS is deployed, while paid execution remains unavailable. Hosted evidence is `evidence/hosted-release/2026-07-13-v3-candidate-production.json`; V3 chain evidence is under `evidence/v3-deployment/`.

The repository now contains the seven V3 Solidity implementations, generated per-module ABIs and a `releaseStatus: "candidate"` manifest populated from canonical receipts. `pnpm artifacts:v3:check` validates seven modules and rejects ten drift/partial-release cases; `pnpm manifest:v3:promote` also checked chain ID, confirmations, CREATE addresses, configuration calldata, runtime hashes, versions, immutable authority/binding state, economics and test-USDC metadata. This supplies deployment evidence, but not live hosted cutover or paid execution.

Live contract: `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`, version `2.0.0`, deployment block `44011800`. No private deployment credential is present in public artifacts.

The v1 deployment is retained only as `deployments/84532-v1.0.0.json`. Its names do not migrate to v2 and are not resolved by the current app or manifest.

## Product decisions

- Brand: SEPBASE; example identity: `alice.sepbase`
- First network: Base Sepolia (`84532`)
- Gas currency: configured chain-native ETH
- Settlement: native ETH for this profile; shared code supports native or one standard ERC-20
- Standard annual price for 4-32 characters: `0.0005` configured settlement units
- Short-name annual multipliers for 1/2/3 characters: `100x / 25x / 5x`
- Base Sepolia protocol fiat reference: intentionally `null`; optional cached UI market reference remains display-only
- Referral reward: `1000` BPS; marketplace fee: `0` BPS
- Design: Modular Typography, black/white with configured Base Blue `#0000ff`, alternating left/right section headings, a structured sticky-bottom footer, restrained reveal motion, and reduced-motion support

## Architecture Deviation

### 2026-07-13 — Shared owner/treasury governance Safe

The product owner selected one governance address for both V3 `owner` and `treasury`. The reviewed implementation uses a deterministic Safe 1.4.1 account with two owners and threshold two. The deploy/configurator EOA and the independent immutable normalization-attestor EOA are the two Safe signers, while the resulting Safe address, attestor address and one-time suite-configurator address remain distinct. Deployment preflight now rejects separate owner/treasury values, an unreviewed or weak-threshold Safe, and any authority collision. This reduces address sprawl without converting the single-use configurator or attestor into protocol owner authority.

The selected configurator currently carries an EIP-7702 delegation designator. Deployment preflight does not treat arbitrary account code as an EOA: it accepts only the exact `0xef0100 || target` form, requires the target to be deployed and explicitly reviewed through configuration, and still requires the raw deployment credential to derive the configurator address. This exception recognizes delegated-EOA transaction semantics without silently approving an unknown smart-account implementation.

### 2026-07-12 — V3 production target supersedes former V1 exclusions

The product owner authorized a new major-version target. ENS/text/Unicode canonicalization, commit-reveal, offers/bids/auctions and production paid x402 are now in v3 scope. They use seven no-proxy addresses because the live v2 runtime has only 74 bytes of EIP-170 margin: six authority/state contracts plus bounded read-only MarketLens. Public resolver, bounded Universal Resolver helper and MarketLens are separate contracts; the lens is not authority or an indexer. Full ENSIP-15 tables remain off-chain under one exact profile; the controller verifies a short-lived EIP-712 statement from an immutable attestor, and each commitment binds its exact hash. V2 remains immutable historical state; migration is explicit and liabilities remain claimable on v2. The architecture and acceptance gates are defined in `PROJECT_SPEC.md` and the v3 documents under `docs/`.

This deviation authorizes in-scope v3 implementation, Base Sepolia contract deployment, hosted cutover, public npm release, managed limited-keeper integration and paid-x402 testnet E2E/payment execution once their stated prerequisites are satisfied. It does not waive audit, multisig, facilitator, durable-store, secret-management, simulation, reconciliation, migration-proof or acceptance gates; missing resources must fail closed, and no operation may be documented as complete/live before transaction and hosted evidence exists.

### 2026-07-12 — Agent interoperability and x402 quote boundary

This subsection records the implemented v2 deviation. The product owner requested first-class AI-agent interoperability, a public MCP surface, and an x402 registration path after the original V1 scope was completed. It expanded the v2 integration layer beyond the original SDK/REST-only boundary, but it did not change the deployed `ChainNameService` contract or claim ENS compatibility.

- MCP is a read-only adapter over the canonical manifest, SDK, HTTP API, and contract reads. It may return a fully scoped registration transaction plan, but it never stores a private key, signs, or broadcasts a user transaction.
- The remote MCP endpoint uses stateless Streamable HTTP; the package also exposes stdio for local agent hosts. Tool results preserve the SDK's typed invalid-input, transport, deployment, and manifest-mismatch semantics.
- x402 paid source is activation-gated and is not a hidden dependency of normal wallet registration or name resolution. The current V3 draft returns `503` before reading request/payment material; a paid-enabled live V3 manifest plus every external runtime gate is required for `402/202/200` behavior.
- An x402 payment must be scoped to the manifest chain, contract, label, recipient, duration, referrer, expected amount, and expected referral BPS. Quotes expire quickly and are re-read before any keeper broadcast.
- Any future production x402 implementation requires payment-identifier deduplication, durable order state, retry/reconciliation monitoring, a keeper spending limit, and a runbook for the rare case where protocol registration succeeds but payment settlement or the HTTP response fails.
- No database or queue is introduced for the core dApp. A future separately reviewed paid handler may add a durable store only inside that execution boundary because paid write idempotency cannot be made reliable with serverless in-memory state.
- ENS compatibility, subdomains, cross-chain resolution, and changes to the deployed v2 contract remain out of scope for v2. The subsequently approved v3 target supersedes the adapter-only restriction through a separate major-version design and audit; it does not backport those features to v2.

## Phase checklist

The checklist below records v2 historical delivery. It must not be used as a v3 Definition of Done.

- [x] Phase 0: repository and pinned toolchain
- [x] Phase 1: contract and unit tests
- [x] Phase 2: fuzz and invariant tests
- [x] Phase 3: deployment, admin, ABI, and manifest tooling
- [x] Phase 4: design system, five public routes, and gated admin operations
- [x] Phase 5: wallet and contract reads
- [x] Phase 6: guarded write flows and exact ERC-20 approvals
- [x] Phase 7: metadata, image, SDK, HTTP API, OpenAPI, and docs
- [x] Phase 8: frontend tests, accessibility states, and browser QA
- [x] Phase 9: clone tooling and operating documentation
- [x] Phase 10A: v2 Base Sepolia broadcast, source verification, manifest, and live reads
- [x] Phase 10B: real multi-account register/referral/marketplace/claim smoke
- [x] Phase 10C: verified identity SDK/React adapter, renewal watch, and Blockscout BENS handoff
- [x] Phase 10D: public GitHub source release and Vercel HTTPS testnet deployment
- [ ] Phase 10E: authenticated RPC, WalletConnect, V3 Safe role cutover, and audit gates; v2 metadata URI cutover is complete
- [x] Phase 10F: source implementation for agent discovery schema v2, MCP transports/tools, quote-only x402 boundary, and pinned CI gates
- [x] Phase 10G: deploy the new web/agent artifacts to the hosted alias and pass address-free draft final-origin browser/API/MCP smoke

## Implemented surfaces

- `ChainNameService.sol`: ERC-721 Enumerable names, 1-32 character validation, short-name tiers, lifecycle/grace, profiles, forward-confirmed primary names, referrals, fixed-price marketplace, pull payments, pause controls, expected-value guards, and solvency checks.
- V3 source-only suite: registry, controller, public resolver, bounded Universal Resolver helper, marketplace, migration and read-only MarketLens compile as separate no-proxy contracts and are exercised by local unit/edge/fuzz/invariant tests. They have no published deployment address.
- V3 source-only integrations: schema-4 draft manifest plus seven ABI artifacts, manifest-first SDK reads/plans (including bounded account reads, per-token marketplace approval, stale-listing invalidation and explicit primary-name clearing), fail-closed V3 HTTP routes and an opt-in 39-tool MCP surface. Draft routes return `V3_NOT_DEPLOYED` rather than falling through to v2.
- Web routes: `/`, `/name/[label]`, `/me`, `/market`, `/developers`, `/security`, `/privacy`, plus wallet-gated `/admin`.
- UX: page-level registration term/quote/referral configuration, automatic configured-chain switching with manual retry, chain-aware registration network-fee estimates, concise cached USD market references, summary-only registration confirmation, receipt-driven active-query refresh, explicit transaction completion states, market/account destinations after writes, one-time accessible market transaction toasts, in-modal wallet connection, settlement amounts, and config-driven optional dated fiat references.
- Hosted v2 UX delta: account referral/seller claims accept checksum-validated alternate recipients, and market empty state is distinct from filter-only no-match with a `/me?tab=listings` handoff. The alternate-recipient helper has targeted unit coverage; final-origin disconnected browser smoke passed, while funded claim/listing transactions remain outside this evidence.
- Public release boundary: an address-complete V3 `candidate` keeps the previous v2 home, registration, account, market and referral UI active. Only an explicitly promoted V3 `live` manifest may switch those user-facing routes; candidate V3 read/API/MCP verification does not silently change settlement display, layout or wallet flows.
- V2 account runtime safety: owned-name pages are published to `/me` only after the complete enumeration/detail multicall is present and runtime type-valid; transient post-registration refetches and malformed `fullName`/`expiresAt` values fail closed as unavailable instead of reaching `BigInt` or string rendering. Wrong-chain account reads are disabled. Network switching is shared single-flight across header/page instances, pins the exact active connector, verifies the provider's resulting chain ID, remains locked through initiating-component unmount, and exposes a visible retry explanation. Injected wallets are now discovered only through their named EIP-6963 providers; the targetless `window.ethereum` fallback was removed so Rabby/MetaMask ownership collisions cannot silently select the wrong provider. If multiple persisted Wagmi connections are still restored, the header blocks network/signing actions behind an explicit named-wallet conflict and visible `Disconnect all` recovery instead of falling through to another wallet.
- V3 market source safety: every visible listing/offer/auction and every transaction review now resolves token ID to label/full name, lifecycle and expiry at its pinned block; context-read failure is fail-closed. A module-scoped lease prevents a second market write across component unmount/account-chain remount, and all composer, row, network, pagination and refresh controls disable while the lease is held. Wallet/chain scope remounts reset recipient, intent and review state. Targeted market coverage is 9 files / 23 tests; funded browser and deployed Base Sepolia evidence remain pending.
- Renewal watch: device-local opt-in, 30-day in-app attention window, 24-hour dismissal, renewal-date resync, and portable ICS export with 30/7/1-day alarms.
- Home stats: onchain name-object count plus registration, marketplace, and payment availability; unavailable reads remain distinct from a real zero.
- Admin: live owner/pending-owner plus configured viewer allowlist, overview health/economics, chunked contract event activity, viewer read-only controls, and simulated owner/pending-owner writes for every supported admin function.
- Content boundary: general routes use user-facing language while SDK, ABI, manifest, OpenAPI, endpoint, and guarded-write details remain available on `/developers` and in machine-readable artifacts.
- Production hardening: API errors are non-cacheable, market server reads consolidate initial state in one Multicall, private `RPC_URL` is isolated from public browser RPC metadata, invalid name routes return 404, and robots/sitemap/security headers are present.
- Agent interoperability: a generated `/.well-known/chain-name-agent.json` schema v4 discovery document; current-v2 `/api/mcp` with eight stable tools; separate opt-in `/api/v3/mcp` with 39 bounded V3 read/unsigned-plan tools, including `owned_names`, `account_balances`, `prepare_listing_invalidate`, `prepare_primary_name_clear` and per-token `prepare_marketplace_approval`; a candidate/live-only same-origin `/api/v3/normalization-attestation` proxy with no local signer/private-key path; MCP `2025-11-25` stateless Streamable HTTP, explicit Origin/body limits, local stdio support, sanitized errors, same-origin/redirect SSRF protection, single-block snapshots, no signer/broadcast authority, and separate x402 availability/milestone metadata.
- x402 boundary: legacy `GET` keeps the free v2 quote; activation-gated `POST` quote issuance obtains the external normalization attestation, builds exact V3 commit/register calldata, checks price/referral plus keeper token allowance/balance and gas at a pinned block, and stores the secret-bearing plan only in encrypted CAS. The paid resource implements official x402 `2.18.0` `402` negotiation, durable payment/authorization deduplication, managed signing, receipt/post-state reconciliation, `202` Workflow `4.6.0` continuation and settled `200` replay. Current deployment/runtime services and funded E2E remain missing, so production availability is not claimed.
- Support routes: referral attribution, name/resolve/verified-reverse/market APIs, ERC-721 metadata/image, OpenAPI, MCP, free x402 registration quotes, two well-known manifests, integration handoff artifacts, and `llms.txt`.
- SDK: manifest-first client, exact ABI checksum and contract-version validation, runtime/Multicall checks, typed errors, origin-locked/manual-redirect manifest resources, RPC redirect rejection, name/profile/state/market/settlement/health reads, reusable single-block snapshots, single-block `verifyAddress`/`verifyName`, and manifest-declared API paths.
- React integration: `@sepbase/react` provider, hook, and address-fallback identity component with stable loading/verified/unverified/error states and CSS custom-property theming.
- Explorer handoff: configured explorer links on name details plus a public Blockscout BENS event/semantics runbook. The required external subgraph and BENS service are not claimed as deployed.
- Portability: gas and settlement metadata remain separate; common code uses configured decimals/base units and selects standard or OP Stack fee estimation from chain config.
- Release automation: SHA-pinned GitHub Actions run frozen installs, offline artifact validation, build/lint/typecheck/tests/audit, the complete Foundry suite and isolated packed-package consumer smoke. A separate npm-production workflow publishes SDK, then React, then MCP with public access and provenance after release validation; the live deployment check remains explicitly opt-in and no funded smoke runs in CI.

## Verification

- `pnpm --filter @sepbase/web exec vitest run features/account/account-workspace.test.ts`: 1 file, 3 tests passed; this covers alternate-recipient normalization/rejection helpers only and is not hosted browser evidence.
- `forge fmt --check --root contracts`: passed.
- `forge build --root contracts`: passed with Solidity `0.8.36`.
- `pnpm contracts:build` and `pnpm contracts:sizes`: passed; the historical v2 runtime remains `24,502 B` with `74 B` EIP-170 margin, while the separate V3 modules pass the size gate.
- `pnpm contracts:test`: 91 passed, 0 failed, 0 skipped: 62 V3 and 29 historical v2 tests, including native/6-decimal ERC-20, failed ERC-20 claim rollback, reentrant bid settlement rejection, fee-on-transfer/rebasing rejection, commit-reveal, resolver, fixed/offer/auction acceptance guards, liabilities, exact historical-V2 migration label grammar, migration-boundary/race protection, fuzz and invariant suites.
- `V3_MIGRATION_SOURCE_BLOCK=44054186 pnpm migration:v3:dry-run`: passed against the immutable Base Sepolia v2 block/hash snapshot and reproduced `evidence/v3-migration/84532-44054186.json` with 6/6 enumerated names eligible and active; embedded `reportSha256` `492ab72338895dc101b3ce4b0b4bb1971d7521fd9797c28ddb20882ded5b4551`. This is eligibility preflight only: it deploys no V3 contract, creates no claim/proof transaction and does not satisfy a migration E2E acceptance row.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build`: passed, including the bundled Node/stdio MCP package, separate Next.js `/api/mcp` and `/api/v3/mcp` routes, and the fail-closed `/api/v3/normalization-attestation` route.
- Current package tests: SDK 55 passed; MCP 34 passed; React 4 passed; web 238 passed across 153 files.
- V3 migration source parity now includes exact-byte legacy label rejection in SDK/MCP, block-pinned SDK eligibility over live migration/v2 state, optional account-scoped MCP eligibility, and a guarded `/me` review/claim flow with explicit recipient versus legacy-address initialization. Focused SDK/MCP/account UI tests pass; no deployed migration claim receipt exists yet.
- Current wallet connector regression subset: 12/12 passed across the connector-pinned/cross-instance network-switch suite, wallet controls and Wagmi configuration. Named EIP-6963 discovery is required, the ambiguous targetless `injected` connector is absent, multi-wallet conflict/disconnect-all is explicit, and retry/single-flight/unmount recovery remains covered. The broader `/me` account tests continue to cover incomplete owned-name snapshots, invalid detail values, defensive rendering and wrong-chain read gating.
- `pnpm packages:smoke`: passed after packing all three packages and installing their tarballs into an isolated temporary NodeNext consumer; this caught and fixed extensionless packed ESM imports.
- Public package workflow `29246721839` passed the complete release gate and published SDK/React/MCP `0.1.0` with signed SLSA provenance. `pnpm exec tsx scripts/package-release-smoke.ts --registry 0.1.0` then passed without an authorization header in an isolated strict-NodeNext consumer. Registry integrity and attestation URLs are recorded in `evidence/npm-release/2026-07-13-v0.1.0.json`.
- Earlier Vercel Production deployment `dpl_5UDQ59oGJX6An7NKnnEYf3dHBgEj` was `Ready` at `https://sepbase.vercel.app`. `HOSTED_RELEASE_EXPECTATION=draft pnpm hosted:check` passed four pages, eight ABI artifacts, eight current-v2 MCP tools and all 39 opt-in V3 tools against the canonical origin. The free x402 quote returned a short-lived HMAC-SHA256 quote using production key ID `sepbase-quote-2026-07-13-v1`; paid execution remained unavailable. Agent-browser loaded `/`, `/me`, `/market` and `/developers` without page/console errors, and the 390x844 home layout rendered without an error overlay. A one-hour deployment error-log query returned zero entries. Evidence is recorded in `evidence/hosted-release/2026-07-13-draft-production.json`. This remains historical hosted draft/source evidence, not a funded wallet flow or deployed-V3 acceptance result.
- The later Vercel Production deployment `dpl_EbnrRgAhFFZ66J7UafLnf6t38oFy` is `Ready` on the same canonical origin with authenticated RPC, WalletConnect and the encrypted internal CAS source. The strict final-origin smoke again passed 4 pages, 8 ABIs and 8+39 MCP tools. Disconnected `/`, `/me` and `/market` browser checks reported zero page/console errors; the internal CAS and paid route returned their expected fail-closed `503` states, and a 15-minute error log query returned zero entries. Evidence is `evidence/hosted-release/2026-07-13-cas-source-production.json`. It was built from a dirty working tree and is not yet a commit-reproducible release.
- V3 browser-security focused tests: 31/31 passed across registration flow/session, pre-submit journal/hash persistence, chain-time recovery, referral scope/consumption, panel single-flight and shared executor behavior. Candidate/live-only normalization-attestation proxy scope, Origin, body-limit, canonical-confirmation, issuer-response, immutable-attestor signature checks and coherent fail-closed/operational x402 discovery states are also included in the green 238-test web suite. Draft HTTP smoke remains fail-closed before issuer access.
- Final local Playwright check: `/`, `/me` and `/market` loaded from the single `localhost:3000` dev server with meaningful content, no Next.js error overlay and zero application console errors; `/me` at 390px had no horizontal overflow. This disconnected/read-only check is not a funded wallet or transaction E2E.
- `pnpm examples:v3:typecheck`: passed for the workspace SDK, Viem, Wagmi, React and MCP consumer fixture. It is not the separate public-registry smoke, a Cast example or a runtime/deployment smoke.
- `pnpm audit --prod`: no known vulnerabilities; pnpm 11 overrides Next's vulnerable transitive PostCSS `8.4.31` with exact patched `8.5.16`.
- `pnpm artifacts:v3:check`: passed one positive and ten fail-closed cases; seven ABI modules, draft release ID, normalization fixture checksum, immutable attestor and immutable Universal Resolver/MarketLens bindings agree.
- `pnpm normalization:validate`: passed 8 accepted and 6 rejected fixtures for the exact pinned profile.
- `pnpm exec tsx scripts/validate-integration-artifacts.ts`: deployment/agent manifests, V2 ABI hash/read surface, V3 target discovery, x402 target metadata, MCP inventory, `llms.txt`, project config and deployment record agree offline.
- `pnpm deployment:check`: passed against v2 bytecode, contract/version, collection, suffix, owner, treasury, settlement, short-name quotes, fees, grace period, Multicall3, and metadata URI.
- `pnpm smoke:base-sepolia`: passed with ephemeral buyer/referrer wallets across guarded registration, renewal, profile, primary, referral accrual/claim, listing, cancellation, purchase, seller claim, treasury withdrawal, and solvency checks. Temporary gas was swept in cleanup.
- API live smoke: manifest/well-known parity, name, resolve, reverse, market, metadata, image, OpenAPI, `llms.txt`, invalid-input status behavior, and cross-origin public artifact headers passed.
- Playwright: desktop/mobile checks across all public routes plus `/admin` disconnected, unauthorized, configured-viewer and live-owner states; overview/activity/controls, owner review dialog, no write broadcast, no horizontal overflow, no visible WCAG text-contrast failures, and zero application console errors/warnings after RPC request consolidation.
- Home-page browser QA: live `4 / OPEN / OPEN / READY` state read on Base Sepolia, four total RPC requests including global checks and recent names, no extra stats polling, no mobile overflow, and zero application console errors/warnings.
- Home/footer browser QA: 02-06 headings alternate across the desktop 12-column grid and collapse to code-first mobile rows; footer remains at document bottom without overlay, canonical Docs/Manifest/`llms.txt` links resolve, and no contrast or overflow failures were found.
- Registration browser QA: term changes update the verified settlement quote before confirmation; configured-chain mismatch triggers an automatic wallet switch and retains a manual switch action; the modal preserves the selected term and amount without duplicating the selector. A live Base Sepolia OP Stack smoke returned a total fee estimate, application/network amounts render concise cached USD references, and desktop/375px layouts have no horizontal overflow or application console errors.
- Market-reference API smoke: the no-auth Coinbase spot route returned a validated ETH/USD quote with 60-second shared caching; malformed/upstream failures remain non-cacheable UI-only errors and never affect protocol quote/write state.
- HTTP smoke: API success/error cache policy, cross-origin resource policy, real invalid-label 404, robots, sitemap, and public artifact caching passed.
- Hosted baseline: `https://sepbase.vercel.app` now serves the current schema-4 agent/V3 draft source while retaining the live historical-v2 contract target. The seven V3 addresses remain null and all value-bearing V3 paths remain gated.
- Previous production browser/API smoke: seven application routes passed desktop and 375px mobile checks with no overflow, overlays, or console errors; the then-current public artifacts returned expected status and headers. This evidence does not cover the new agent routes.
- Local agent-page QA: `/developers`, `/security`, and `/privacy` passed desktop/375px checks without overflow, framework overlay, or console errors. Mobile navigation moves focus into the menu, closes on Escape, and restores trigger focus; developer tabs implement arrow/Home/End roving focus. Visual QA also caught and fixed a literal `\n` in the install snippet.
- Historical Phase 10F local endpoint smoke: MCP initialize negotiated `2025-11-25`; the then-generated agent discovery returned schema v2 and OpenAPI `1.1.0`; Origin/body-limit and fail-closed paid-POST checks passed without payment or transaction. Current source has since advanced to agent schema v4, separate `/api/v3/mcp`, a fail-closed normalization-attestation proxy, the V3 account snapshot and OpenAPI `1.7.0`; this historical smoke is not evidence for those new artifacts or hosted V3 routes.

Expected Foundry timestamp lint notices remain because expiration and grace-period behavior is intentionally timestamp-based.

## Release pending

1. Deploy the seven-address V3 suite on Base Sepolia, source-verify every module, publish non-null runtime hashes/receipts and prove the four registry plus two helper bindings before changing draft status.
2. Rotate the chat-exposed authenticated RPC credential, then add availability/rate monitoring for hosted read APIs.
3. Complete funded V3 wallet/browser E2E for the implemented source UI: external normalization attestation, pre-submit commit recovery, guarded reveal, resolver records, primary set/clear, fixed listings, offers, auctions and every proceeds/refund claim. Source flows and regression tests exist, but no deployed V3 address or funded transaction receipt currently exercises them.
4. Complete funded desktop/mobile WalletConnect V3 wallet E2E, including a live non-empty marketplace fixture; connector rendering alone is not transaction evidence.
5. Configure the `publish-packages.yml` GitHub OIDC trusted publisher for each npm package, then revoke the bootstrap granular token. The initial public `0.1.0` release and anonymous registry smoke are complete; the next release must verify the tokenless trusted-publisher path.
6. Move release roles to reviewed multisig operations, obtain an independent smart-contract/operations audit, remediate findings and complete the defined Base Sepolia soak.
7. Complete the approved V3 paid x402 V2 boundary as a separate reviewed activation. Adapter/workflow/store/signer source and unit tests exist and the durable database/schema is provisioned, but the shipped route is not yet redeployed/wired to a live V3 suite, managed signer and reconciliation runtime; no funded payment/replay/failure E2E exists.

The Vercel production environment has the final HTTPS site origin, current agent/CAS artifacts, a production quote authenticator, authenticated Base Sepolia RPC, WalletConnect configuration, provisioned Neon database/schema/CAS secrets and healthy Workflow endpoints; v2 on-chain metadata points to that origin. Deployment `dpl_EbnrRgAhFFZ66J7UafLnf6t38oFy` predates the database secrets and proves only the earlier hosted source/fail-closed behavior. The supplied RPC credential was exposed in chat and must be rotated. A deployed/candidate V3 manifest, managed attestation issuer, managed keeper, fresh hosted CAS smoke and remaining paid-runtime evidence are separate gates. Local development continues to use `http://localhost:3000`.

## Architecture notes

The deployed v2 product remains one standalone dApp, one chain, one suffix, one non-upgradeable protocol contract, and no core database or indexer. The pending V3 release now has source implementations for seven immutable/no-proxy addresses: six authority/state contracts for registry, controller, public resolver, bounded Universal Resolver helper, marketplace and migration, plus bounded read-only MarketLens. Registry wiring locks controller, resolver, migration and marketplace once through the immutable suite configurator; Universal Resolver and MarketLens bindings are verified separately. The immutable normalization attestor is a separate signer trust boundary, not an owner-rotatable eighth protocol module, and MarketLens is not authority. V3 may use a durable store only inside its separately reviewed paid-x402 execution boundary because paid-write idempotency cannot be reliable in process memory. Blockscout BENS enablement remains an external adapter/subgraph deployment, not a hidden app dependency. V2 runtime bytecode is only `74 B` below EIP-170, so future contract features require the separate V3 release rather than adding logic to v2.
