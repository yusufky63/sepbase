# Implementation Status

Last updated: 2026-07-12

## Current phase

The v2 Base Sepolia test release is implemented, deployed, source-verified, and exercised with a real multi-account write smoke. The web app, read-only API, manifest, ABI, OpenAPI, SDK/React package sources, referral flow, fixed-price marketplace, verified identity reads, and local renewal watch all target the same live registry. A live home-page platform summary reuses the global health Multicall without adding polling. Final HTTPS hosting and release operations remain external launch tasks.

Live contract: `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`, version `2.0.0`, deployment block `44011800`. No private deployment credential is present in public artifacts.

The v1 deployment is retained only as `deployments/84532-v1.0.0.json`. Its names do not migrate to v2 and are not resolved by the current app or manifest.

## Product decisions

- Brand: SEPBASE; example identity: `alice.sepbase`
- First network: Base Sepolia (`84532`)
- Gas currency: configured chain-native ETH
- Settlement: native ETH for this profile; shared code supports native or one standard ERC-20
- Standard annual price for 4-32 characters: `0.0005` configured settlement units
- Short-name annual multipliers for 1/2/3 characters: `100x / 25x / 5x`
- Base Sepolia fiat reference: intentionally `null`; test ETH is not assigned a USD value
- Referral reward: `1000` BPS; marketplace fee: `0` BPS
- Design: Modular Typography, black/white with configured Base Blue `#0000ff`, alternating left/right section headings, a structured sticky-bottom footer, restrained reveal motion, and reduced-motion support

## Phase checklist

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
- [ ] Phase 10D: final HTTPS site release and metadata URI cutover

## Implemented surfaces

- `ChainNameService.sol`: ERC-721 Enumerable names, 1-32 character validation, short-name tiers, lifecycle/grace, profiles, forward-confirmed primary names, referrals, fixed-price marketplace, pull payments, pause controls, expected-value guards, and solvency checks.
- Web routes: `/`, `/name/[label]`, `/me`, `/market`, `/developers`, plus wallet-gated `/admin`.
- UX: page-level registration term/quote/referral configuration, summary-only registration confirmation, receipt-driven active-query refresh, explicit transaction completion states, market/account destinations after writes, one-time accessible market transaction toasts, in-modal wallet connection, settlement amounts, and config-driven optional dated fiat references.
- Renewal watch: device-local opt-in, 30-day in-app attention window, 24-hour dismissal, renewal-date resync, and portable ICS export with 30/7/1-day alarms.
- Home stats: onchain name-object count plus registration, marketplace, and payment availability; unavailable reads remain distinct from a real zero.
- Admin: live owner/pending-owner plus configured viewer allowlist, overview health/economics, chunked contract event activity, viewer read-only controls, and simulated owner/pending-owner writes for every supported admin function.
- Content boundary: general routes use user-facing language while SDK, ABI, manifest, OpenAPI, endpoint, and guarded-write details remain available on `/developers` and in machine-readable artifacts.
- Production hardening: API errors are non-cacheable, market server reads consolidate initial state in one Multicall, private `RPC_URL` is isolated from public browser RPC metadata, invalid name routes return 404, and robots/sitemap/security headers are present.
- Support routes: referral attribution, name/resolve/verified-reverse/market APIs, ERC-721 metadata/image, OpenAPI, well-known manifest, integration handoff artifacts, and `llms.txt`.
- SDK: manifest-first client, exact ABI checksum and contract-version validation, runtime/Multicall checks, typed errors, name/profile/state/market/settlement/health reads, single-block `verifyAddress`/`verifyName`, and manifest-declared API paths.
- React integration: `@sepbase/react` provider, hook, and address-fallback identity component with stable loading/verified/unverified/error states and CSS custom-property theming.
- Explorer handoff: configured explorer links on name details plus a public Blockscout BENS event/semantics runbook. The required external subgraph and BENS service are not claimed as deployed.
- Portability: gas and settlement metadata remain separate; common code uses configured decimals and base units.

## Verification

- `forge fmt --check --root contracts`: passed.
- `forge build --root contracts`: passed with Solidity `0.8.36`.
- `forge build --sizes --root contracts`: passed; runtime `24,502 B`, EIP-170 margin `74 B`.
- `forge test -vvv --root contracts`: 29 passed, 0 failed, including native and 6-decimal ERC-20 settlement, fee-on-transfer rejection, fuzz, and invariant suites.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build`: passed.
- `pnpm test`: SDK 10 passed; React 2 passed; web 44 passed.
- `pnpm audit --prod`: no known vulnerabilities; pnpm 11 overrides Next's vulnerable transitive PostCSS `8.4.31` with exact patched `8.5.16`.
- `pnpm deployment:check`: passed against v2 bytecode, contract/version, collection, suffix, owner, treasury, settlement, short-name quotes, fees, grace period, Multicall3, and metadata URI.
- `pnpm smoke:base-sepolia`: passed with ephemeral buyer/referrer wallets across guarded registration, renewal, profile, primary, referral accrual/claim, listing, cancellation, purchase, seller claim, treasury withdrawal, and solvency checks. Temporary gas was swept in cleanup.
- API live smoke: manifest/well-known parity, name, resolve, reverse, market, metadata, image, OpenAPI, `llms.txt`, invalid-input status behavior, and cross-origin public artifact headers passed.
- Playwright: desktop/mobile checks across all public routes plus `/admin` disconnected, unauthorized, configured-viewer and live-owner states; overview/activity/controls, owner review dialog, no write broadcast, no horizontal overflow, no visible WCAG text-contrast failures, and zero application console errors/warnings after RPC request consolidation.
- Home-page browser QA: live `4 / OPEN / OPEN / READY` state read on Base Sepolia, four total RPC requests including global checks and recent names, no extra stats polling, no mobile overflow, and zero application console errors/warnings.
- Home/footer browser QA: 02-06 headings alternate across the desktop 12-column grid and collapse to code-first mobile rows; footer remains at document bottom without overlay, canonical Docs/Manifest/`llms.txt` links resolve, and no contrast or overflow failures were found.
- Registration browser QA: term changes update the verified settlement quote before confirmation; the modal preserves the selected term and amount without duplicating the selector; desktop and 375px mobile layouts have no horizontal overflow or application console errors.
- HTTP smoke: API success/error cache policy, cross-origin resource policy, real invalid-label 404, robots, sitemap, and public artifact caching passed.

Expected Foundry timestamp lint notices remain because expiration and grace-period behavior is intentionally timestamp-based.

## Release pending

1. Deploy the web app with its final HTTPS `NEXT_PUBLIC_SITE_URL`.
2. Update the on-chain metadata base URI from localhost to the final site URL, regenerate the manifest, and rerun `pnpm deployment:check`.
3. Use an authenticated production RPC and add availability/rate monitoring for the hosted read API.
4. Publish and version `@sepbase/sdk` and `@sepbase/react`; until then consumers must use workspace packages or ABI/OpenAPI surfaces.
5. Before any value-bearing mainnet profile, move owner/treasury roles to reviewed multisig operations and obtain an independent smart-contract audit.

`pnpm release:check` currently fails as designed on the unresolved hosted-release inputs: localhost/non-HTTPS site URL, missing server-only `RPC_URL`, and missing WalletConnect project ID. After the site URL changes, it also requires the manifest/on-chain metadata base URI to match that final origin.

## Architecture notes

The product remains one standalone dApp, one chain, one suffix, one non-upgradeable protocol contract, and no database or indexer. Blockscout BENS enablement remains an external adapter/subgraph deployment, not a hidden app dependency. Runtime bytecode is only `74 B` below EIP-170, so future contract features require a new version with code split/reduction rather than adding logic to v2.
