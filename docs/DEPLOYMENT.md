# Deployment

SEPBASE uses Foundry scripts. Hardhat is not part of the toolchain.

## Version boundary

The commands below deploy and operate the **current v2 contract**. They do not deploy v3.

V3 is an approved, actively implemented seven-address release: six authority/state contracts plus one bounded read-only MarketLens for ENS/text/Unicode, commit-reveal, fixed+offer+auction marketplace discovery and migration. Base Sepolia deployment and cutover are in scope once the gates below pass. It must use separate versioned deployment records and ABI/manifests. Never overwrite `deployments/84532.json`, point the v2 UI at a partial v3 module, or describe work-in-progress as deployed.

Before the first v3 broadcast, all of the following must exist:

- frozen APIs for registry, controller, public resolver, bounded Universal Resolver helper, marketplace and migration plus ENSIP-15/ENS conformance fixtures;
- complete Foundry matrix and bytecode/role review for every module;
- immutable EIP-712 normalization-attestor key ceremony, profile hash, expiry policy and replacement-release runbook;
- one-time registry suite-configurator/wiring ceremony that is distinct from owner/multisig roles;
- migration controller plus reproducible v2 eligibility dry run;
- configured standard ERC-20 settlement profile if paid x402 is in the candidate;
- one shared 2-of-2 Safe for owner/treasury and a separate keeper least-privilege plan;
- independent audit scope and deployment ceremony/runbook;
- v3 manifest schema, all seven addresses/versions/ABI checksums, four stateful registry bindings, independent Universal Resolver and MarketLens bindings, resolver/lens capability matrices, normalization profile/fixture hash/attestor and final-origin staging plan;
- rollback/incident policy that keeps v2 claims and v3 refunds available.

The source topology now defines seven no-proxy contracts with `VERSION = 3.0.0`: six authority/state contracts plus bounded read-only `ChainNameMarketLensV3`. No deployment address, broadcast script result or acceptance evidence is established by source alone. Exact constructor values and final verification commands remain release artifacts. Placeholder addresses must not be added to this guide.

The first V3 Base Sepolia paid-x402 deployment target is CAIP-2 `eip155:84532` with Circle's standard 6-decimal test USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` ([official address table](https://developers.circle.com/stablecoins/usdc-contract-addresses)). Deployment must read it from the versioned config/manifest, verify token code/metadata and bind the same address as immutable protocol settlement and x402 payment asset. Gas remains separate Base Sepolia test ETH. Test USDC and test ETH have no guaranteed fiat value. This target does not alter the live V2 native-settlement deployment.

### V3 dependency order and one-time wiring

The deployment ceremony must preserve this dependency model:

1. Deploy the registry with suffix/root nodes, exact normalization profile hash, owner, immutable `suiteConfigurator`, lifecycle and metadata values.
2. Deploy the public resolver against that registry.
3. Deploy the controller against registry+public resolver with immutable normalization-attestor address, bounded attestation validity, commit ages, settlement and guarded economics.
4. Deploy migration against registry+public resolver+immutable v2 source and the announced window.
5. Deploy marketplace against the same registry and settlement profile.
6. Deploy the separate Universal Resolver helper against the registry.
7. Deploy `ChainNameMarketLensV3(marketplace)` and verify its immutable `marketplace` and derived `registry` bindings. Exercise block-pinned listing/offer/auction pages, 50-result/100-scan bounds, raw `nextCursor`, terminal offer inclusion and `stale` projection. The lens is not part of registry authority and does not replace an indexer.
8. From the immutable `suiteConfigurator`, call `configureSuite(controller, publicResolver, migration, marketplace)` once; verify all four event/state bindings, then prove a second call and wrong caller cannot change wiring.

`suiteConfigurator` is not owner/multisig authority. For the first V3 profile, `OWNER_ADDRESS` and `TREASURY_ADDRESS` must be the same reviewed 2-of-2 Safe; that Safe, the immutable normalization attestor and the one-time configurator remain three distinct addresses. Public resolver, Universal Resolver helper and MarketLens are separate manifest addresses. The first resolver profile excludes contenthash; the helper supports the documented ENSIP-23 simple resolve/reverse profile only, while CCIP-Read and smart multicall remain unsupported. Each constructor/deployment/wiring transaction, runtime bytecode hash, `VERSION`, ABI checksum and source-verification URL belongs in the release evidence bundle.

The normalization attestor is a signer address embedded immutably in the controller, not an eighth protocol contract. Its EIP-712 statement binds profile hash, chain, controller, label hash, recipient and `validUntil`; the registration commitment binds the exact attestation hash. Loss or compromise cannot be repaired by an owner setter and requires a reviewed controller/suite release and manifest cutover.

## Environment

Create a local `.env` from `.env.example`. Never commit a private key or place one in a `NEXT_PUBLIC_*` variable.

Required for Base Sepolia broadcast:

- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_SITE_URL`
- `PRIVATE_KEY`
- `OWNER_ADDRESS`
- `TREASURY_ADDRESS`

The V3 wrapper additionally requires `SOURCE_COMMIT`,
`V3_SUITE_CONFIGURATOR_ADDRESS`, `NORMALIZATION_ATTESTOR_ADDRESS`,
`V3_REVIEWED_MULTISIG_ADDRESSES`, the exact V3 constructor profile from
`.env.example`, and an explicit future migration window. Owner and treasury
must be allowlisted deployed Safe contracts with threshold at least two; the
temporary configurator and immutable attestor must remain separate roles.
If the credential address has an EIP-7702 delegation designator, its exact
deployed implementation target must additionally appear in
`V3_ALLOWED_CONFIGURATOR_DELEGATION_TARGETS`; arbitrary contract code and
unreviewed delegation targets fail closed. A classical EOA leaves this list empty.
`V3_BROADCAST=false` is the default and runs only fail-closed preflight/gates.

Required for the final hosted web release:

- `NEXT_PUBLIC_SITE_URL` set to the final HTTPS origin
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- server-only `RPC_URL`, separate from the browser-visible `NEXT_PUBLIC_RPC_URL`

`SEPBASE_MANIFEST_URL` and `SEPBASE_RPC_URL` configure a local stdio MCP host; they are not browser variables and do not grant transaction authority. The hosted `/api/mcp` route derives discovery from the configured canonical site origin and uses server-only `RPC_URL` when present.

The current deployed/draft x402 availability remains `fail-closed`, while source implementation status is `activation-gated`. Keep `X402_REGISTRATION_ENABLED=false` until the V3 manifest is live and paid-enabled, the external facilitator/CAS/signer/attestor/workflow stack is deployed, per-order/daily keeper limits are enforced, the keeper is separately funded and approved, abuse/monitoring/runbook/review confirmations are true, and funded section-J E2E/security evidence exists. Configuration presence alone is not activation evidence.

For the Base Sepolia test profile, the official no-setup facilitator is `https://x402.org/facilitator` and the network identifier is `eip155:84532`. It verifies and settles testnet payments; it is not a separate SEPBASE website and does not replace the durable order store, limited keeper, normalization issuer or reconciliation workflow. SEPBASE clients continue to call the three `/api/x402/registration*` routes on the final SEPBASE origin.

`RPC_URL` is used by server-side read-only API routes when present and is never emitted in the public manifest or API context. The browser continues to use the public/domain-restricted `NEXT_PUBLIC_RPC_URL`.

Explorer verification additionally uses `EXPLORER_VERIFIER` and the verifier-specific API key. For an Etherscan-supported chain such as Base Sepolia, leave `EXPLORER_API_URL` blank and let Foundry select the V2 endpoint from `--chain 84532`. A custom Etherscan URL must be the full V2 API URL with the matching `chainid`; Blockscout URLs must end in `/api/`.

`PRIVATE_KEY` should use `0x` plus 64 hexadecimal digits. The local loader also normalizes an otherwise valid 64-digit key in memory; the `.env` file is never rewritten or exposed to browser code. `FORGE_BIN` is optional because the scripts also detect the standard user-level Foundry installation.

For production-value deployments, use an encrypted Foundry keystore or hardware signer workflow instead of a raw key. Never paste a private key into chat, source files, command history, or a `NEXT_PUBLIC_*` variable.

## Preflight

```bash
pnpm project:validate
pnpm exec tsx scripts/validate-integration-artifacts.ts
pnpm chain:check
forge test -vvv --root contracts
forge build --sizes --root contracts
```

## Broadcast

The live V2 metadata cutover is an idempotent, owner-checked operation:

```bash
pnpm contracts:metadata:v2
```

It derives the final `/api/metadata/` base URI from `NEXT_PUBLIC_SITE_URL`, simulates the owner call, waits five Base Sepolia confirmations and verifies the value at the confirmed block. The private key remains environment-only.

```bash
pnpm contracts:deploy
```

The separate V3 ceremony never reuses the V2 wrapper:

```bash
# Full profile, role, Safe, token, chain and Foundry preflight; no broadcast.
V3_BROADCAST=false pnpm contracts:deploy:v3

# Only from the reviewed clean SOURCE_COMMIT and funded configurator ceremony.
V3_BROADCAST=true pnpm contracts:deploy:v3

# After every one of the eight receipts has the manifest confirmation floor.
pnpm manifest:v3:promote

# After audit/soak/incident/funded-x402 evidence and every server runtime gate.
# Default is read-only preflight; the write flag is a separate deliberate ceremony.
pnpm manifest:v3:live
V3_LIVE_ACTIVATION_WRITE=true pnpm manifest:v3:live
pnpm manifest:generate
```

The authenticated `RPC_URL` remains server-only and is passed to Foundry through
the child environment rather than command-line arguments. Promotion parses the
exact seven CREATE receipts plus `configureSuite`, verifies their on-chain
transactions/block hashes/runtime code, then runs the SDK's pinned-block suite
verification before atomically replacing the draft with a `candidate` manifest.
Partial, pending, failed, mismatched or under-confirmed evidence writes nothing.

Live promotion additionally requires `V3_PAID_X402_ENABLED=true`, a clean matching
`SOURCE_COMMIT`, full paid-runtime readiness, and four workspace-local evidence
documents plus reviewed SHA-256 values:

```text
V3_AUDIT_EVIDENCE_PATH / V3_AUDIT_EVIDENCE_SHA256
V3_SOAK_EVIDENCE_PATH / V3_SOAK_EVIDENCE_SHA256
V3_INCIDENT_DRILL_EVIDENCE_PATH / V3_INCIDENT_DRILL_EVIDENCE_SHA256
V3_PAID_X402_E2E_EVIDENCE_PATH / V3_PAID_X402_E2E_EVIDENCE_SHA256
```

Each document must use `sepbase.v3.release-evidence.v1`, bind chain `84532`, the
candidate suite release ID and source commit, and declare `result: pass`. A successful
write produces an immutable `evidence/v3-release/live-<release-id>.json` activation
record. Regenerate discovery/llms afterward and run hosted live smoke before promotion.

The wrapper validates project and chain metadata, checks ERC-20 bytecode/metadata when applicable, runs Foundry build and tests, broadcasts `contracts/script/Deploy.s.sol`, selects the configured explorer verifier, synchronizes the exact receipt block and timestamp, exports the ABI, regenerates the public deployment manifest, agent discovery and `llms.txt`, and compares critical configuration against live contract reads. It refuses to overwrite a live deployment with the same contract version.

An intentional version replacement additionally requires an exact immutable archive at `deployments/<chainId>-v<oldVersion>.json` and the one-shot `ALLOW_VERSION_REDEPLOY=true` environment flag. The wrapper checks that the archive matches the current address, version, and deployment transaction before broadcasting. This preserves discovery history without pretending that assets from the old contract migrated to the new registry.

After broadcast, review `deployments/<chainId>.json`, confirm source verification, compare the manifest with live contract state, validate deployment/agent/ABI artifact parity, and execute the post-deployment register/renew/profile/referral/marketplace smoke flows. A deployment must never reuse a manifest or agent discovery document from another chain, contract, suffix, or settlement asset.

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

The current test deployment metadata base URI is `http://localhost:3000/api/metadata/`. The web app is already published, but NFT metadata cutover is not complete. Set the final HTTPS `NEXT_PUBLIC_SITE_URL`, confirm the metadata route is reachable, and update the contract through `Admin.s.sol` with `ADMIN_ACTION=setMetadataBaseURI`. Regenerate and recheck the manifest only after that admin transaction is confirmed.

After the metadata cutover and hosted environment configuration, run `pnpm release:check`. It intentionally fails in the current localhost profile and prevents a release with localhost metadata, a missing private server RPC, or missing mobile wallet configuration.

## Agent-surface web deployment

Contract deployment and web source deployment are separate operations. Adding `/api/mcp` or x402 quote code locally does not publish it to the Vercel production alias. After deploying the web source, verify the final origin instead of relying on a local smoke:

```bash
curl -fsS https://<final-origin>/.well-known/chain-name-agent.json
curl -fsS https://<final-origin>/api/openapi.json
curl -fsS https://<final-origin>/llms.txt
```

Then run MCP `initialize` and `tools/list` requests with the required Streamable HTTP headers in both supported security profiles: a browser request with the exact configured canonical `Origin`, and a server/MCP-client request with no `Origin` header. A non-canonical Preview origin must remain `403`; that is not an MCP outage. Request a free x402 quote for a fresh canonical label without sending a payment signature. The paid registration `POST` must return fail-closed `503` and must not echo payment material.

The repository packages these checks into one strict final-origin gate. It verifies the four public pages, V2/V3 manifests, all eight ABI checksums, OpenAPI server/path parity, `llms.txt`, MCP `2025-11-25` negotiation, both configured-browser-origin and origin-less server-client access, exact 8+39 tool inventories, the free quote, V3 draft/live behavior, and x402 `503`/`402` semantics. It rejects redirects, a localhost or cross-origin metadata URI, stale OpenAPI servers, partial V3 addresses and missing paid availability:

```bash
HOSTED_RELEASE_ORIGIN=https://<candidate-origin> HOSTED_RELEASE_EXPECTATION=draft pnpm hosted:check
HOSTED_RELEASE_ORIGIN=https://<final-origin> HOSTED_RELEASE_EXPECTATION=live pnpm hosted:check
```

Protected Preview deployments may provide `HOSTED_RELEASE_BYPASS_SECRET` from the hosting secret store. The script never prints it. `.github/workflows/hosted-release-smoke.yml` exposes the same check as a manual, environment-gated workflow.

At the 2026-07-13 audit, production deployment `dpl_5UDQ59oGJX6An7NKnnEYf3dHBgEj` is `Ready` at canonical origin `https://sepbase.vercel.app`. `HOSTED_RELEASE_EXPECTATION=draft pnpm hosted:check` passed four public pages, both manifests, all eight ABI artifacts, OpenAPI/`llms.txt`, exact 8+39 MCP tool inventories, configured-browser-origin and origin-less access, a production-authenticated free x402 quote and the expected paid/V3 draft fail-closed paths. Desktop/mobile browser smoke reported no page or console errors, and a one-hour runtime error-log query returned zero entries. Evidence is `evidence/hosted-release/2026-07-13-draft-production.json`. This is a hosted draft cutover only: all seven V3 addresses remain null, paid execution remains unavailable, and authenticated RPC/WalletConnect/live-V3 funded gates are still open.

Before exposing MCP publicly, enforce Origin validation, bounded request size/timeouts, rate limiting and abuse monitoring at the route/hosting boundary. MCP remains read/preparation-only and must never receive a private key, signer, wallet session or broadcast capability.

## V3 paid x402 execution release gate

This section is a release gate, not a configuration-only activation procedure. The activation-gated implementation uses exact-pinned `@x402/core`, `@x402/evm`, `@x402/extensions` `2.18.0` and `workflow` `4.6.0`; it persists pre-payment secret-bearing plans and paid orders in the authenticated encrypted CAS, never returns the secret plan to the caller, and requires exact payment/asset/payTo plus managed-signer bindings. Operational activation additionally requires a compatible live ERC-20 V3 deployment, reviewed facilitator, authenticated RPC, durable service protocol, pre-funded keeper allowance and gas, attestor service, reconciliation/refund runbook, testnet replay/failure E2E and independent security review.

Clients must persist the returned `paymentIdentifier` and `planId`. After any timeout they query `GET /api/x402/registration/status`; they do not create another payment until the durable order is conclusively absent. The status response intentionally omits payment payloads, authorization hashes, quote HMAC material and secret-bearing calldata.

For v3 this release gate is an explicit product target, but it remains disabled until the complete order state machine and section J of `docs/V3_ACCEPTANCE_MATRIX.md` pass. Commit-reveal makes the keeper workflow multi-step: verified payment cannot be treated as completed registration until attestation scope/expiry, commitment age, reveal receipt and configured confirmations reconcile. Evidence must follow `docs/TRANSACTION_EVIDENCE.md`.

## V3 hosted and migration cutover

1. Deploy and verify all seven audited v3 addresses, immutable attestor/profile, four-argument one-time registry wiring, Universal Resolver binding and MarketLens binding without changing v2 discovery.
2. Publish shadow v3 manifests with `releaseStatus: candidate` and paid execution false.
3. Run migration eligibility dry run/challenge period from `docs/MIGRATION_V2_TO_V3.md`.
4. Complete every acceptance-matrix row, independent audit, incident drill, funded paid-x402 E2E and Base Sepolia soak.
5. Run fail-closed `manifest:v3:live` preflight, then the deliberate write ceremony and regenerate discovery/llms/OpenAPI parity.
6. Set final HTTPS metadata/resolver URLs and verify distinct public-resolver/Universal-Resolver addresses and bounded capabilities.
7. Announce deterministic v2/v3 resolver precedence and migration window.
8. Cut over hosted web, SDK, MCP and OpenAPI together; run `HOSTED_RELEASE_EXPECTATION=live` smoke.
9. Keep v2 referral/seller claims reachable for the published support period.

No cutover step moves v2 liabilities into v3 treasury accounting.
