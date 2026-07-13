# @sepbase/sdk

Manifest-first TypeScript reads for one SEPBASE deployment. This workspace package is build-ready but has not been published to npm.

```ts
import { createSepbaseClient } from "@sepbase/sdk";

const manifestUrl = "https://names.example/.well-known/chain-name-service.json";
const names = await createSepbaseClient({
  manifestUrl,
  allowedManifestOrigins: [new URL(manifestUrl).origin],
  allowedRpcOrigins: ["https://reviewed-rpc.example"],
  rpcUrl: "https://reviewed-rpc.example",
});

const identity = await names.verifyAddress("0x1234567890123456789012345678901234567890");
const display = identity.verified ? identity.primaryName : identity.account;
```

The client validates manifest schema and deployment identity, fetches the ABI without following redirects, verifies the exact ABI SHA-256, confirms chain/contract/Multicall bytecode and contract version, and keeps manifest resources on the manifest origin. RPC redirects are rejected.

For server use, configure `manifestUrl`, `rpcUrl`, `allowedManifestOrigins`, and `allowedRpcOrigins` from trusted application configuration. Never proxy an untrusted user-supplied URL. Infrastructure should additionally protect against DNS rebinding and private-address resolution.

Core V2 reads include name state/profile/quotes, forward and reverse resolution, verified address/name identity, validated market listings, settlement metadata, and protocol solvency. Related reads can share `{ blockNumber }` snapshot options; verification helpers already pin their own related reads to one block.

All token IDs, timestamps, balances, and settlement amounts remain `bigint`. Asset symbol and decimals come from the verified manifest. Gas currency and protocol settlement are separate metadata. The SDK has no signer, wallet session, token approval, or broadcast authority.

## V3 suite API

The separately versioned V3 API is exposed by `createSepbaseV3Client`. It consumes schema-v4 `/deployment-manifest.v3.json` and refuses the current address-free `draft`. A candidate/live client is returned only after all seven addresses and ABIs pass SHA-256, runtime-code-hash, `VERSION`, one-time registry wiring, helper binding, owner/treasury, normalization, price, settlement-token metadata, market-policy and migration checks.

```ts
import { createSepbaseV3Client } from "@sepbase/sdk";

const manifestUrl = "https://names.example/deployment-manifest.v3.json";
const v3 = await createSepbaseV3Client({
  manifestUrl,
  allowedManifestOrigins: [new URL(manifestUrl).origin],
  allowedRpcOrigins: ["https://reviewed-rpc.example"],
  rpcUrl: "https://reviewed-rpc.example",
});

const normalized = v3.normalize("alice");
const record = await v3.getNameRecord(normalized.normalizedLabel);
const owned = await v3.getOwnedNames("0x1234567890123456789012345678901234567890", 0n, 24);
const balances = await v3.getAccountBalances("0x1234567890123456789012345678901234567890");
const listings = await v3.getListings(0n, 24);
const offers = await v3.getGlobalOffers(0n, 24, true);
const auctions = await v3.getAuctions(0n, 24);
```

V3 includes exact ENSIP-15 normalization, addr/multicoin/text/reverse reads, block-pinned bounded owner enumeration and account balances, commit/reveal planning, fixed listings, escrowed offers, English auctions, claims, migration and receipt reconciliation. Migration is intentionally narrower than public normalization: `assertLegacyV2MigrationLabel` rejects suffixes, case folding, trimming and Unicode transformation, while `getMigrationEligibility` reads the live window, pause, reservation, v2 lifecycle/owner/expiry/address and manifest bindings at one block before `prepareMigrationClaim` constructs a guarded plan. `prepareMarketplaceApproval` prepares the separate registry `approve(marketplace, tokenId)` transaction needed before marketplace custody paths; it verifies current ownership/approval at one block and deliberately avoids blanket `setApprovalForAll`. `prepareList`, `prepareAcceptOffer` and `prepareStartAuction` refuse to return a plan unless that per-token approval is active at their pinned block; listing update and buy preparation likewise reject stale listing state. Transaction helpers return unsigned plans only. They never approve, sign, broadcast, persist the caller's commitment secret, send it to a remote service, or call an x402 payment endpoint. The reveal calldata necessarily contains the caller-supplied secret. Callers must independently simulate and obtain explicit wallet authority.

The V3 resolver implements the capabilities declared in its manifest. The first profile intentionally does not claim contenthash, CCIP-Read, smart multicall, subdomains, cross-chain routing, or complete official ENS Universal Resolver parity. The live V2 deployment remains an independent non-ENS-compatible historical protocol until a V3 cutover is evidenced.
