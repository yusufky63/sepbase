# V3 Architecture Target

Status: **approved implementation architecture; work in progress, not yet acceptance-complete or evidenced as deployed**
Date: 2026-07-12

This document decomposes the binding v3 override in `PROJECT_SPEC.md` for active implementation. The live Base Sepolia release remains `ChainNameService` v2.0.0 until versioned cutover evidence exists. No v3 address, paid x402 handler, ENS compatibility claim, offer, or auction may be described as live without its acceptance and release evidence.

## Product boundary

V3 remains one Base Sepolia application and one `.sepbase` namespace, but it is no longer constrained to one protocol contract. The v2 runtime has only 74 bytes of EIP-170 margin; adding ENS, commit-reveal, offers, auctions, or migration to that bytecode would be unsafe.

The first candidate defines six authority/state contracts plus one bounded read-only market lens, for seven independently deployable on-chain addresses. Source presence is not deployment or acceptance evidence:

| Component | Responsibility | Must not do |
|---|---|---|
| `ChainNameRegistryV3` | ENS ownership, token lifecycle, node ownership | Pricing, payment custody, arbitrary admin transfer |
| `ChainNameControllerV3` | Verify normalization attestation; commit/reveal/register/renew; settlement/referral accounting | Normalize arbitrary Unicode on-chain, keep user secrets, bypass commitment age |
| `ChainNameResolverV3` | Address/multicoin/text/name records and ENSIP-10 extended resolution | Treat unverified reverse as identity |
| `ChainNameUniversalResolverV3` | Registry discovery plus bounded ENSIP-23 simple resolve/reverse entrypoint | Claim contenthash, CCIP-Read, smart multicall or full official ENS Universal Resolver parity |
| `ChainNameMarketplaceV3` | Fixed listings, escrowed offers, English auctions, claims/refunds | Direct seller/outbid payout during buy/bid |
| `ChainNameMigrationV3` | One-time eligible v2 claims | Move v2 liabilities or silently rewrite ownership |
| `ChainNameMarketLensV3` | Bounded, indexer-free listing/offer/auction pagination and stale/terminal offer projection | Write state, hold custody/approval, replace marketplace/registry truth or promise snapshot pagination |

The hosted agent/x402 service is an off-chain execution boundary, not an eighth protocol contract and never the source of ownership truth. The seventh address, `ChainNameMarketLensV3`, is not an authority module; it is a bounded view helper.

All seven implementations are no-proxy and expose version `3.0.0` in the current implementation baseline. The registry receives an immutable `suiteConfigurator`, which may call `configureSuite(controller,resolver,migration,marketplace)` once; those four stateful bindings then lock permanently. Universal Resolver is independently bound to the registry. MarketLens is independently bound to the marketplace and derives the registry from that marketplace. That temporary configurator authority is separate from owner/multisig administration. Every address, version, ABI checksum and independent binding must be verified before candidate cutover.

## Canonical name pipeline

Every surface consumes the same conformance corpus:

```text
raw UTF-8 input
  -> remove the exact configured suffix once
  -> ENSIP-15 normalization
  -> reject invalid/confusable/mixed-script input
  -> normalized label + normalized full name
  -> labelhash/namehash/token identity
```

The manifest publishes normalizer name/version/profile hash, exact fixture SHA-256, attestor address and supported resolver interfaces. APIs return both normalized output and a typed rejection; they never silently delete characters. The pinned profile is `@adraffy/ens-normalize@1.11.1`, Unicode 17.0.0, CLDR 47, with identifier `ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47` and profile hash `0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638`. The initial corpus is `fixtures/name-normalization.json`.

Client-only normalization is insufficient because a direct caller could otherwise submit noncanonical bytes. The controller therefore also requires a short-lived EIP-712 attestation from the deployment's immutable normalization attestor. The typed struct binds `chainId`, `controller`, registry `normalizationProfileHash`, exact normalized `labelHash`, `recipient` and `validUntil`; the EIP-712 domain also scopes the verifying controller. The registration commitment binds the exact attestation hash alongside payer, recipient, node, resolver initialization, duration, referrer, settlement, expected amount/BPS and secret.

The attestation is not itself consumed as a one-time bearer token; the matching commitment is single-use. Forged, expired, overly long-lived or wrong-scope attestations revert before collection/state. This provides a contract-level canonical/confusable gate while introducing an explicit bounded trust dependency: attestor compromise can authorize a bad new label and attestor loss can stop new registrations. It cannot change existing names. The attestor address has no owner setter; replacement requires a reviewed new controller/suite release and versioned manifest cutover.

## Commit-reveal

Current implementation API shape; selectors remain non-release claims until tests and ABI evidence pass:

```solidity
function makeCommitment(
    bytes32 node,
    address payer,
    address recipient,
    uint8 durationYears,
    bytes32 resolverInitializationHash,
    bytes32 normalizationAttestationHash,
    address referrer,
    bytes32 secret,
    uint256 expectedAmount,
    uint16 expectedReferralRewardBps
) public view returns (bytes32);

function commit(bytes32 commitment) external;

function register(
    RegistrationRequest calldata request,
    ResolverInitialization calldata initialization,
    NormalizationAttestation calldata attestation
) external payable returns (uint256 tokenId, bytes32 node);
```

`RegistrationRequest` carries exact normalized label bytes, recipient, duration, referrer, secret, resolver-initialization hash, normalization-attestation hash and expected amount/referral BPS. `makeCommitment` additionally binds payer, derived node, settlement kind/token, chain and controller. Commit timestamps are single-use. Early, expired, copied, cross-chain, cross-controller, wrong-attestation and wrong-payer reveals revert before payment/state changes.

## Resolver and identity

The public resolver and Universal Resolver helper are distinct addresses and compatibility claims:

- `ChainNameResolverV3` stores supported on-chain records and implements the bounded ENSIP-10 `resolve(bytes,bytes)` dispatch.
- `ChainNameUniversalResolverV3` discovers that resolver through the registry and exposes the supported ENSIP-23 simple `resolve`/`reverse` ABI with forward-confirmed EVM reverse lookup.
- The first profile intentionally excludes contenthash, CCIP-Read and smart multicall. Unsupported selectors/profiles revert with typed errors; docs and manifests must not call this a full official ENS Universal Resolver equivalent.

Minimum v3 reads:

```text
resolve normalized name -> address record
reverse address -> candidate primary name
verify candidate owner/lifecycle/forward address -> verified identity or address fallback
text normalized name,key -> bounded untrusted string
```

Transfer clears or version-invalidates old owner identity data according to the audited resolver policy. Arbitrary text and URLs remain untrusted content in web, SDK, MCP and metadata rendering.

## Marketplace state

All market objects bind chain, marketplace, token/node, settlement asset, ownership nonce, fee snapshot and expiry.

### Fixed listing

```text
NONE -> ACTIVE -> UPDATED | CANCELLED | SOLD | INVALIDATED | EXPIRED
```

Buy re-reads owner/lifecycle/listing nonce and passes exact expected price. Proceeds become a seller pull balance.

### Offer

```text
OPEN (escrow funded)
  -> ACCEPTED (seller proceeds + NFT recipient)
  -> CANCELLED/EXPIRED/INVALIDATED (buyer refund liability)
```

Offer acceptance and refund are mutually exclusive terminal states. Ownership nonce prevents a stale pre-transfer offer from being accepted by an unintended new owner.

### English auction

```text
SCHEDULED -> ACTIVE -> ENDED -> FINALIZED
                 \-> CANCELLED (only before first bid)
```

Each new highest bid escrows exact value and credits the previous bidder's refund balance. Finalization is permissionless and single-use. Anti-sniping extension is bounded by maximum extension count/total end time. Auction custody and name expiry constraints prevent bypass by transfer or sale of a released name.

### Bounded MarketLens projection

`ChainNameMarketLensV3` reads marketplace enumeration without becoming a source of truth. `getListings`, per-token `getOffers`, and `getAuctions` return only records that remain active at the pinned block. `getGlobalOffers`, `getBuyerOffers`, and `getOwnerOffers` may include terminal `REFUNDED` and `ACCEPTED` history and mark an otherwise `ACTIVE` record `stale=true` when owner/lifecycle/transfer-nonce checks no longer match.

Each page accepts `limit` 1-50 and scans at most 100 raw entries. `nextCursor` is the next raw index even when stale records were filtered. Marketplace swap-pop cleanup can reorder later indices, so consumers pin one block, deduplicate by token/offer ID, and re-read authoritative marketplace/registry state before writes. The lens is explicitly not an indexer or historical completeness guarantee.

## Unified accounting

The marketplace/controller expose auditable totals per liability class plus a sum:

```text
totalReferralLiability
totalSellerLiability
totalOfferRefundLiability
totalBidRefundLiability
totalX402RefundLiability
totalProtectedLiability
settlementBalance
treasuryAvailableBalance
isSolvent
```

Every transition has conservation assertions. No successful list/offer/bid/buy/accept/finalize path may make protected liabilities exceed supported settlement balance. Direct payout is forbidden in economic entry points; recipients claim later.

## Paid x402 and durable workflow

Paid registration is a hosted execution boundary, not contract authority. It needs a standard ERC-20 settlement profile supported by the selected facilitator; gas remains Base Sepolia ETH.

Durable entities:

| Entity | Unique identity | Important fields |
|---|---|---|
| Quote | `quoteId` | normalized request, block, amount, expiry, contract/suite |
| Payment | facilitator payment identifier | asset, amount, payer, verification/settlement evidence |
| Order | request fingerprint | quote, recipient, commit/reveal state, tx hashes |
| Attempt | order + monotonic attempt | action, result, retry classification |
| Refund | payment/order | amount, recipient, status, evidence |

Unique constraints reject replay before keeper execution. A crash between commit and reveal resumes from persisted state. A crash after transaction submission reconciles receipt before any retry. Raw signing keys are forbidden; the keeper uses a managed signer, allowlisted targets/selectors, exact value and rate/spend limits.

## API/package target

The deployment and agent manifests publish v2 historical and v3 target/live status separately. V3 SDK/MCP methods must distinguish preparation from execution:

```ts
normalizeName(input)
prepareCommit(request)
prepareReveal(request, secret)
resolveName(name, snapshot?)
reverseLookup(address, snapshot?)
getText(name, key, snapshot?)
getFixedListing(tokenId, snapshot?)
getOffers(tokenId, cursor?, snapshot?)
getGlobalOffers(cursor?, includeTerminal?, snapshot?)
getBuyerOffers(buyer, cursor?, includeTerminal?, snapshot?)
getOwnerOffers(owner, cursor?, includeTerminal?, snapshot?)
getAuction(tokenId, snapshot?)
getClaimableBalances(account, snapshot?)
getMigrationEligibility(account, name, snapshot?)
```

Runnable examples are compiled fixtures. Placeholder-only snippets are explicitly labelled pseudocode and never presented as copy/paste verified.

## Operations

- Owner/treasury/upgrade roles: reviewed multisig; timelock where non-emergency.
- Keeper: separate least-privilege identity and balance.
- Facilitator and server RPC: server-only secrets with rotation.
- Monitoring: solvency, liability deltas, commitment/reveal lag, auction finalization lag, refund age, payment duplicates, keeper spend, drift and admin events.
- Emergency policy: pause new risk while preserving cancel/refund/claim/migration recovery.
- Evidence: each release and economic smoke follows `docs/TRANSACTION_EVIDENCE.md`.

## Delivery stages

1. Specification, threat model and conformance fixtures.
2. Seven-address matrix: six authority/state contracts plus bounded read-only MarketLens, four-argument one-time registry wiring, independent helper bindings and Foundry evidence.
3. Marketplace and unified accounting contracts.
4. Migration contract and dry-run snapshot.
5. SDK/React/web UX and compiled examples.
6. MCP reads/plans.
7. Durable x402 service, facilitator and limited keeper.
8. Independent audit, fixes and Base Sepolia soak.
9. Hosted metadata/discovery cutover and monitored release.

No stage is marked complete merely because this document exists.
