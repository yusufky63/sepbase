# Deployment

SEPBASE uses Foundry scripts. Hardhat is not part of the toolchain.

## Environment

Create a local `.env` from `.env.example`. Never commit a private key or place one in a `NEXT_PUBLIC_*` variable.

Required for Base Sepolia broadcast:

- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_SITE_URL`
- `PRIVATE_KEY`
- `OWNER_ADDRESS`
- `TREASURY_ADDRESS`

Required for the final hosted web release:

- `NEXT_PUBLIC_SITE_URL` set to the final HTTPS origin
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- server-only `RPC_URL`, separate from the browser-visible `NEXT_PUBLIC_RPC_URL`

`RPC_URL` is used by server-side read-only API routes when present and is never emitted in the public manifest or API context. The browser continues to use the public/domain-restricted `NEXT_PUBLIC_RPC_URL`.

Explorer verification additionally uses `EXPLORER_VERIFIER` and the verifier-specific API key. For an Etherscan-supported chain such as Base Sepolia, leave `EXPLORER_API_URL` blank and let Foundry select the V2 endpoint from `--chain 84532`. A custom Etherscan URL must be the full V2 API URL with the matching `chainid`; Blockscout URLs must end in `/api/`.

`PRIVATE_KEY` should use `0x` plus 64 hexadecimal digits. The local loader also normalizes an otherwise valid 64-digit key in memory; the `.env` file is never rewritten or exposed to browser code. `FORGE_BIN` is optional because the scripts also detect the standard user-level Foundry installation.

For production-value deployments, use an encrypted Foundry keystore or hardware signer workflow instead of a raw key. Never paste a private key into chat, source files, command history, or a `NEXT_PUBLIC_*` variable.

## Preflight

```bash
pnpm project:validate
pnpm chain:check
forge test -vvv --root contracts
forge build --sizes --root contracts
```

## Broadcast

```bash
pnpm contracts:deploy
```

The wrapper validates project and chain metadata, checks ERC-20 bytecode/metadata when applicable, runs Foundry build and tests, broadcasts `contracts/script/Deploy.s.sol`, selects the configured explorer verifier, synchronizes the exact receipt block and timestamp, exports the ABI, regenerates the public manifest, and compares critical configuration against live contract reads. It refuses to overwrite a live deployment with the same contract version.

An intentional version replacement additionally requires an exact immutable archive at `deployments/<chainId>-v<oldVersion>.json` and the one-shot `ALLOW_VERSION_REDEPLOY=true` environment flag. The wrapper checks that the archive matches the current address, version, and deployment transaction before broadcasting. This preserves discovery history without pretending that assets from the old contract migrated to the new registry.

After broadcast, review `deployments/<chainId>.json`, confirm source verification, compare the manifest with live contract state, and execute the post-deployment register/renew/profile/referral/marketplace smoke flows. A deployment must never reuse a manifest from another chain or settlement asset.

```bash
pnpm deployment:check
pnpm smoke:base-sepolia
```

The Base Sepolia smoke is intentionally network-restricted and refuses mainnet or ERC-20 profiles. It creates ephemeral buyer/referrer accounts in memory, funds them from the configured deployer, exercises guarded writes and pull payments, and sweeps remaining test gas back in a `finally` cleanup.

## Current Base Sepolia release

- Contract version: `2.0.0`
- Contract: [`0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`](https://sepolia.basescan.org/address/0xe000de3efe798aa4f834fd952bef35bae1b16945#code)
- Deployment block: `44011800`
- Transaction: [`0xdcd222ed0c1cb2bbe882840b9ad9d756a2020b720f21a1936f8f955a75a81368`](https://sepolia.basescan.org/tx/0xdcd222ed0c1cb2bbe882840b9ad9d756a2020b720f21a1936f8f955a75a81368)
- Source: verified, Solidity `0.8.36`, optimizer enabled with one run, non-proxy

The archived v1 record is `deployments/84532-v1.0.0.json`. Its contract remains live, and names registered there, including `ethereum.sepbase`, are not assets in v2. The v2 manifest and application intentionally resolve only the v2 registry.

The current test deployment metadata base URI is `https://sepbase.vercel.app/api/metadata/`. The owner update was confirmed in transaction [`0x80a501b33c00e93e2bb6b87f0623b53ed3a42d054cdaa64d37097d3d11032c4b`](https://sepolia.basescan.org/tx/0x80a501b33c00e93e2bb6b87f0623b53ed3a42d054cdaa64d37097d3d11032c4b) at block `44066412`; the machine-readable receipt is retained in `evidence/v2-metadata-cutover/84532-44066412.json`.

For a hosted release, run `pnpm release:check` with the final HTTPS site origin and hosted environment configuration. It intentionally prevents a release with localhost metadata, a missing private server RPC, or missing mobile wallet configuration.
