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
- ABI, OpenAPI, metadata/image routes, `llms.txt`, and Blockscout BENS handoff documentation

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

## Architecture

```text
Next.js dApp / SDK / React / HTTP API
                  |
                  v
       deployment-manifest.json
                  |
                  v
      ChainNameService.sol (v2.0.0)
                  |
                  v
           Base Sepolia RPC
```

The contract is the source of truth. The application has no required database or indexer. API responses pin related reads to one block, and verified identity reads fail closed to the checksummed wallet address when ownership, lifecycle, primary mapping, and forward resolution do not agree. The optional market-reference route is display-only: it is cached, does not enter settlement math, and cannot change transaction availability or expected-value guards.

## Repository layout

```text
apps/web/          Next.js App Router dApp and read-only API
contracts/         Foundry contract, deployment script, unit/fuzz/invariant tests
packages/sdk/      Manifest-first TypeScript SDK
packages/react/    React provider, hook, and verified identity component
deployments/       Reviewed public Base Sepolia deployment records
docs/              Deployment, operations, security, and readiness documentation
scripts/           Validation, manifest, deployment, smoke, and release tooling
```

## Local development

Requirements:

- Node.js `22.12.0+`
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

- Solidity: `29` unit, fuzz, and invariant tests passing
- SDK: `10` tests passing
- React package: `2` tests passing
- Web: `56` tests passing
- Contract runtime: `24,502 B` with `74 B` remaining below EIP-170
- Production dependency audit: no known vulnerabilities

The funded Base Sepolia write smoke is intentionally separate because it broadcasts transactions and spends testnet funds:

```bash
pnpm smoke:base-sepolia
```

## Integration

Start with the deployment manifest and validate its ABI checksum and contract version before reading names:

```text
/deployment-manifest.json
/.well-known/chain-name-service.json
/abi/ChainNameService.json
/api/openapi.json
/llms.txt
```

Workspace packages:

```bash
pnpm add @sepbase/sdk @sepbase/react
```

The package sources are release-ready but are not yet published to the public npm registry. Until publication, consumers can use the ABI/OpenAPI surfaces or workspace packages in this monorepo.

## Deployment status

The Base Sepolia contract is deployed, source-verified, and has passed a real multi-account registration/referral/marketplace smoke. The hosted dApp can be deployed independently and never receives the deployment private key.

The Vercel project uses `apps/web` as its Root Directory, includes workspace source files outside that directory, and installs dependencies from the repository-level pnpm workspace.

Before treating the project as a value-bearing mainnet release:

1. Configure a final HTTPS origin, authenticated server RPC, and WalletConnect project ID.
2. Update the onchain metadata base URI to the final hosted API and regenerate the manifest.
3. Move owner and treasury operations to a reviewed multisig.
4. Add hosted rate limiting, monitoring, and automated CI/E2E gates.
5. Complete an independent contract and operations audit.

Run `pnpm release:check` to enforce the hosted release inputs. See [Production Readiness](docs/PRODUCTION_READINESS.md), [Deployment Operations](docs/DEPLOYMENT.md), [Integration Guide](INTEGRATION_GUIDE.md), and [Project Specification](PROJECT_SPEC.md) for the canonical details.
