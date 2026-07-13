# Transaction and Release Evidence

This document defines how an authorized Base Sepolia, mainnet-discipline smoke is proven. The current v3 implementation goal permits scoped broadcasts after the applicable simulation, signer, funding and safety gates pass; this evidence format does not waive those prerequisites.

## Safety rules

- Never record a private key, seed phrase, raw signer credential, authenticated RPC URL, reusable payment payload or session cookie.
- Use purpose-limited funded test identities and the configured chain only.
- A preparation/simulation result is not transaction evidence.
- A transaction is successful only after the configured confirmation count and expected event/state reconciliation.
- After timeout, inspect receipt/current state before retrying.

## Evidence record

Each authorized write records:

```yaml
evidenceVersion: 1
releaseId: <commit/artifact identifier>
environment: base-sepolia
chainId: 84532
contractOrModule: <checksum address>
suiteReleaseId: <seven-address manifest/artifact identifier>
operation: <commit|reveal|list|offer|bid|buy|finalize|claim|refund|migrate>
actorRole: <registrant|seller|buyer|bidder|keeper|migration-claimant>
normalizedName: <public name or null>
preconditions:
  blockNumber: <decimal string>
  normalizationProfileHash: <0x... or null>
  normalizedLabelHash: <0x... or null>
  normalizationAttestationHash: <0x... or null>
  normalizationAttestationValidUntil: <unix seconds or null>
  expectedAmountBaseUnits: <decimal string or null>
  expectedFeeBps: <integer or null>
  expectedReferralRewardBps: <integer or null>
  objectNonce: <decimal string or null>
simulation:
  succeeded: true
  atBlock: <decimal string>
transaction:
  hash: <0x...>
  blockNumber: <decimal string>
  confirmations: <integer>
  status: success
events:
  - <expected event summary>
postconditions:
  owner: <checksum address or null>
  liabilityDeltaBaseUnits: <signed decimal string>
  settlementBalanceDeltaBaseUnits: <signed decimal string>
  objectState: <terminal/current state>
explorerUrl: <public URL>
notes: <redacted operational notes>
```

## Required scenario bundles

### Registration

- commitment transaction;
- immutable attestor address, EIP-712 recovered signer/scope check and exact attestation hash bound by the commitment, without attestor-service credentials;
- minimum-age evidence;
- reveal transaction and normalized name;
- payment/quote/referral guard values;
- owner/resolver/expiry post-state;
- separate public-resolver and bounded Universal-Resolver-helper result where applicable;
- early/expired/front-run negative-test references.

### Fixed sale

- list/update/cancel or list/buy receipts;
- listing nonce, seller, exact price and fee snapshot;
- NFT owner/resolution/profile cleanup;
- seller liability and later claim receipt.

### Offer

- escrow creation;
- accept or cancel/expire terminal receipt;
- seller proceeds or buyer refund liability;
- claim receipt and balance conservation.

### Auction

- creation and NFT custody;
- bid/outbid sequence with each refund liability;
- extension evidence where exercised;
- finalize/cancel terminal receipt;
- NFT/proceeds/refund post-state.

### MarketLens reads

- lens address/version/ABI checksum plus immutable marketplace and derived registry bindings;
- pinned block, requested limit, raw cursor/next cursor and returned object IDs;
- evidence that limit `50`, scan `100`, stale filtering and terminal offer inclusion match the published capability;
- authoritative marketplace/registry re-read before any transaction; lens output alone is never write authorization or historical-completeness evidence.

### Referral/proceeds/refunds

- before/after claimable balance;
- selected recipient;
- total liability decrement and exact recipient delta;
- failure-path evidence for rejected/failed payout.

### Paid x402

- redacted quote ID, request fingerprint and payment identifier hash;
- durable state transitions and timestamps;
- facilitator verification/settlement reference without reusable auth;
- commit/reveal transaction evidence;
- duplicate request result;
- refund/reconciliation evidence where applicable.

### Migration

- source block/proof identifier;
- v2 owner/status/expiry;
- v3 claim receipt and mapped records;
- duplicate/non-owner rejection;
- v2 liabilities shown unchanged.

## Release bundle

A release bundle links:

- exact source commit and generated artifact checksums;
- seven contract addresses (six authority/state + bounded read-only MarketLens), `VERSION` values, ABI/runtime checksums, four-argument one-time registry wiring event/state, independent Universal Resolver/MarketLens bindings and normalization profile/fixture/attestor identity;
- Foundry/package/browser/E2E command outputs;
- contract source verification links;
- acceptance-matrix row IDs;
- audit report and remediation references;
- final-origin manifest/OpenAPI/ABI/metadata/MCP/x402 smoke;
- monitoring dashboard/alert test and incident drill date.

`docs/IMPLEMENTATION_STATUS.md` may summarize evidence but must not replace or invent it.
