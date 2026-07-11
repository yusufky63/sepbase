# Implementation checklist

> This is the reusable blank checklist for new clones. The live SEPBASE implementation state and verification evidence are maintained in `docs/IMPLEMENTATION_STATUS.md`.

## Faz 0 - Scaffold
- [ ] pnpm workspace
- [ ] Next.js App Router
- [ ] Foundry
- [ ] strict TypeScript
- [ ] ESLint
- [ ] `.env.example`
- [ ] config schema: separate native/settlement metadata and optional dated fiat reference
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
- [ ] integration examples
- [ ] native/ERC-20 settlement examples

## Faz 8 - QA
- [ ] frontend unit tests
- [ ] fiat-reference ratio/staleness tests without testnet fake USD
- [ ] component tests
- [ ] local E2E smoke
- [ ] accessibility
- [ ] developer docs smoke test
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

## Faz 10 - Testnet
- [ ] chain check
- [ ] deployment
- [ ] verification
- [ ] site release
- [ ] wallet smoke test
- [ ] configured settlement smoke test
