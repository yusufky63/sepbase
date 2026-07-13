# Implementation checklist

> This is the reusable blank checklist for new clones. The live SEPBASE implementation state and verification evidence are maintained in `docs/IMPLEMENTATION_STATUS.md`.

## V3 production target override

The checklist below this section remains the historical v2 clone baseline. V3 completion additionally requires every item below and the evidence in `docs/V3_ACCEPTANCE_MATRIX.md`.

### V3 contracts and canonical names

- [ ] immutable/no-proxy versioned contract suite; every runtime below EIP-170 with documented margin
- [ ] exact-pinned ENSIP-15 normalizer and shared conformance corpus
- [ ] normalized label/full-name, labelhash, namehash and token identity parity across contract/SDK/API/UI
- [ ] ENS registry/resolver interface discovery, forward address, forward-confirmed reverse and bounded text records
- [ ] commit/reveal binding chain, controller, owner, duration, resolver init, referrer, settlement, guards and secret
- [ ] early/expired/copied/cross-chain/cross-controller reveal rejection
- [ ] native and 6-decimal ERC-20 registration/referral/renewal accounting
- [ ] explicit v2→v3 migration eligibility, replay protection and evidence

### V3 marketplace

- [ ] guarded fixed listing/update/cancel/buy with expiry and ownership nonce
- [ ] exact-funded offer escrow, accept, cancel, expire, invalidate and pull refund
- [ ] English auction reserve/start/end/min-increment/bounded anti-sniping
- [ ] outbid pull refund, permissionless single finalize and failed-auction NFT return
- [ ] transfer/expiry/migration cleanup and mutually exclusive terminal states
- [ ] unified referral/seller/offer/bid/x402 liability and solvency invariants
- [ ] native + ERC-20 + fee-on-transfer + payout rollback + reentrancy/fuzz/invariant matrix

### V3 agent, packages and operations

- [ ] SDK/React/MCP v3 typed APIs and compiled consumer examples
- [ ] npm public package license, semver, provenance, changelog and clean-install smoke
- [ ] MCP single-message/Origin/body/rate-limit/timeout compliance
- [ ] paid x402 V2 matching ERC-20 asset, CAIP-2 and PAYMENT-* headers
- [ ] authenticated quotes, durable idempotency/lease fencing and status reconciliation
- [ ] managed keeper signer, target/spend limits, facilitator verify/settle and refund workflow
- [ ] final HTTPS metadata, manifests, ABI checksums, OpenAPI, llms and agent discovery parity
- [ ] multisig/admin runbooks, observability/alerts, independent audit and Base Sepolia soak

## Faz 0 - Scaffold
- [ ] pnpm workspace
- [ ] Next.js App Router
- [ ] Foundry
- [ ] strict TypeScript
- [ ] ESLint
- [ ] `.env.example`
- [ ] config schema: separate native/settlement metadata, fee-estimation model, optional dated fiat reference, optional UI market reference, and integration paths
- [ ] `AGENTS.md`
- [ ] `docs/IMPLEMENTATION_STATUS.md`

## Faz 1 - Contract
- [ ] ERC721Enumerable
- [ ] Ownable2Step
- [ ] ReentrancyGuard
- [ ] ERC4906
- [ ] IERC20 + SafeERC20
- [ ] label validation
- [ ] configured 4-32 character annual base price/base units
- [ ] immutable 1/2/3 character premium multipliers
- [ ] annual-price overflow bound
- [ ] NATIVE settlement mode
- [ ] ERC20 settlement mode
- [ ] exact ERC-20 balance-delta validation
- [ ] settlement payout/rescue helpers
- [ ] liability/solvency health and economic-action guard
- [ ] register
- [ ] renew
- [ ] register/renew expected-amount guard
- [ ] expiration/grace
- [ ] re-registration
- [ ] profile
- [ ] resolution
- [ ] primary name
- [ ] forward-confirmed primary resolution
- [ ] `hasPrimary` sentinel safety
- [ ] released-token operation lock
- [ ] transfer profile/listing/primary cleanup
- [ ] reserved names
- [ ] reserved read and effective-availability semantics
- [ ] treasury/withdrawTreasury
- [ ] referral attribution
- [ ] referral expected-reward-rate guard
- [ ] referral pull-payment balances
- [ ] referral claim
- [ ] fixed-price marketplace listings
- [ ] list/update expected-fee guard
- [ ] listing enumeration
- [ ] buy/cancel listing
- [ ] buy expected-price guard
- [ ] seller proceeds pull-payment
- [ ] marketplace fee (`0 bps` initial)
- [ ] independent marketplace pause
- [ ] metadata base URI
- [ ] unit tests
- [ ] deployed bytecode size margin

## Faz 2 - Advanced tests
- [ ] fuzz tests
- [ ] invariant tests
- [ ] native + 6-decimal ERC-20 fixtures
- [ ] fee-on-transfer rejection fixture
- [ ] external-balance-loss insolvency fixture

## Faz 3 - Deployment tooling
- [ ] Deploy.s.sol
- [ ] Admin.s.sol
- [ ] chain-check.ts
- [ ] manifest generation
- [ ] settlement metadata/base-unit manifest
- [ ] manifest v3 name rules, Multicall3, and short-name pricing schedule
- [ ] native gas currency and settlement metadata kept separate
- [ ] ABI export
- [ ] deterministic ABI SHA-256 and contract version validation
- [ ] generated agent discovery bound to the same chain, contract, suffix, and manifest
- [ ] offline integration-artifact validation for manifest, ABI, agent discovery, MCP tool inventory, and `llms.txt`
- [ ] configurable explorer source verification

## Faz 4 - Static UI
- [ ] design tokens
- [ ] typography
- [ ] Modular Typography grid
- [ ] home
- [ ] name page states
- [ ] account names tab
- [ ] account tabs: names/referrals/listings
- [ ] marketplace
- [ ] developer docs
- [ ] gated admin overview/activity/controls states
- [ ] disconnected, wrong-network, unauthorized, viewer, owner and pending-owner admin gates
- [ ] dialogs
- [ ] pause/insolvency global states
- [ ] responsive

## Faz 5 - Reads
- [ ] custom chain
- [ ] wagmi
- [ ] wallet connection
- [ ] network guard
- [ ] availability
- [ ] reserved-name state
- [ ] quote
- [ ] 1/2/3/4-character quote consistency
- [ ] profile reads
- [ ] recent names
- [ ] owner enumeration
- [ ] referral balance reads
- [ ] settlement kind/token/balance/allowance reads
- [ ] liabilities/solvency reads
- [ ] native currency, fee and pause-state reads
- [ ] active marketplace listings
- [ ] seller proceeds reads
- [ ] admin health, treasury, liabilities, supply/listing and deployment reads
- [ ] deployment-block-to-latest chunked admin event activity

## Faz 6 - Writes
- [ ] register
- [ ] renew
- [ ] exact ERC-20 approval flow
- [ ] update profile
- [ ] set/clear primary
- [ ] safe transfer with cleanup warning
- [ ] tx states
- [ ] explicit transaction-complete states and contextual next actions
- [ ] explorer links
- [ ] referral link attribution
- [ ] referral reward claim
- [ ] list/update/cancel sale
- [ ] permissionless stale-listing invalidation
- [ ] buy listed name
- [ ] seller proceeds claim
- [ ] owner admin controls with simulation/review/receipt states
- [ ] pending-owner ownership acceptance

## Faz 7 - Metadata & integrations
- [ ] metadata route
- [ ] metadata profile/resolution properties and released semantics
- [ ] SVG image route
- [ ] token URI verification
- [ ] TypeScript SDK package
- [ ] exported ABI
- [ ] `/.well-known/chain-name-service.json`
- [ ] schema-version and manifest/config/contract consistency guard
- [ ] read-only resolve/reverse API
- [ ] read-only name lifecycle/availability/quote API
- [ ] read-only market API
- [ ] bounded market scanning and stable API error envelope
- [ ] OpenAPI document
- [ ] `llms.txt`
- [ ] `/.well-known/chain-name-agent.json` with explicit implementation status
- [ ] stateless MCP Streamable HTTP plus local stdio transport
- [ ] MCP public read tools and unsigned guarded `prepare_registration`; no signer, payment, or broadcast path
- [ ] MCP HTTP Origin validation, bounded request behavior, and hosted abuse/rate-limit policy
- [ ] free, pinned-block x402 registration quote/readiness endpoint
- [ ] x402 paid registration endpoint hard-fails closed as `quote-only`; environment configuration cannot enable execution
- [ ] no core database/indexer/queue; no paid x402 runtime or durable store without a separately approved architecture phase
- [ ] integration examples
- [ ] native/ERC-20 settlement examples

## Faz 8 - QA
- [ ] frontend unit tests
- [ ] fiat-reference ratio/staleness tests without testnet fake USD
- [ ] component tests
- [ ] local E2E smoke
- [ ] accessibility
- [ ] developer docs smoke test
- [ ] agent manifest schema/parity tests
- [ ] MCP initialize/tool-list/error/Origin tests
- [ ] x402 quote validation, expiry, scope, and fail-closed paid-route tests
- [ ] OpenAPI and `llms.txt` parity with all shipped agent routes
- [ ] referral E2E flow
- [ ] marketplace E2E flow
- [ ] native/ERC-20 settlement E2E flows
- [ ] expected amount/referral-BPS/fee/price mismatch E2E
- [ ] admin link visibility, read-only viewer, owner controls and no-broadcast review QA
- [ ] production build

## Faz 9 - Clone workflow
- [ ] clone:reset
- [ ] README
- [ ] DEPLOYMENT.md
- [ ] CLONE_CHECKLIST.md
- [ ] clone reset regenerates deployment and agent artifacts with a null/new deployment scope
- [ ] previous `SEPBASE_*` and `X402_*` operator environment values are cleared manually

## Faz 10 - Testnet
- [ ] chain check
- [ ] deployment
- [ ] verification
- [ ] site release
- [ ] SHA-pinned CI workflow is committed, active, and required on the release branch
- [ ] wallet smoke test
- [ ] configured settlement smoke test
- [ ] final-origin smoke for agent discovery, MCP initialize, free x402 quote, and fail-closed paid POST
