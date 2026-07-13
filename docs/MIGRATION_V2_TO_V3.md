# V2 to V3 Migration Plan

Status: **source implemented and locally tested; no migration controller or window is evidenced as deployed/live yet**.

## Non-negotiable facts

- V2 and the seven-address v3 release—six authority/state contracts for registry/controller/public-resolver/Universal-Resolver/marketplace/migration plus bounded read-only MarketLens—are separate deployments and token collections.
- V2 ownership, referral balances and seller proceeds remain governed by the v2 contract.
- Deploying v3 does not burn, bridge, upgrade or automatically copy a v2 NFT.
- No v3 migration claim is valid until the migration controller, eligibility block/policy and final contract addresses are published and audited.

## Eligibility target

An ASCII v2 label is eligible if, at the declared source block/live-check policy:

1. the v2 token exists;
2. it is ACTIVE or GRACE under v2 rules;
3. the claimant is the v2 owner or presents an explicitly supported owner signature/proof;
4. the canonical v3 normalized label corresponds exactly to the already-canonical lowercase v2 ASCII label under the published profile;
5. the source token/label has not already migrated.

The selected proof model must be one of:

- live on-chain read of the immutable v2 contract; or
- audited Merkle snapshot with published source block, deterministic generator, reproducible root and challenge period.

The release cannot mix proof models without an explicit versioned policy.

## Normalization and attestor boundary

Public v3 registration requires the controller's immutable EIP-712 normalization attestor. Migration is a different, narrowly bounded authority: the migration contract accepts only the historical v2 lowercase ASCII grammar and proves current/source-policy ownership against the immutable v2 registry. It does not accept arbitrary Unicode, call the public attestation service or let a claimant self-assert a normalized label.

For every eligible label, migration tooling must run `fixtures/name-normalization.json`'s exact pinned profile and prove that normalized bytes, `labelHash`, token ID and v3 node match the historical ASCII bytes. A collision with any already registered/migrated v3 node rejects. This migration exception cannot be reused as a public registration bypass. Changing the public attestor still requires a new reviewed controller/suite release; it does not change migration eligibility already anchored to v2.

The SDK, MCP and V3 `/me` source now enforce that same boundary before transaction planning. They reject suffixes, uppercase/case-folded input, whitespace, consecutive/edge hyphens and Unicode instead of silently normalizing them. `getMigrationEligibility`, account-scoped `migration_status`, and the account UI pin the migration window/pause/reservation plus v2 lifecycle, owner, expiry and address record to one confirmed block. The user explicitly chooses whether the initial V3 address record is the V3 recipient or the guarded v2 address; listings, text profile and primary state are never copied. These are source tests, not a deployed claim receipt.

## Reservation and window

- Claim eligibility and reservation have deliberately different start boundaries. Claims open at
  `migrationStartsAt`, but live ACTIVE/GRACE v2 labels are reserved as soon as the v3 suite is
  configured and remain reserved through the inclusive `migrationEndsAt`. This closes the
  suite-deployment/configuration → claim-window-start race in which a public commit/reveal could
  otherwise preempt a v2 holder.
- Migration pause never releases a reservation. If the migration reservation read fails, registry
  availability and public registration fail closed rather than treating the label as unreserved.
- At `migrationEndsAt + 1`, the migration reservation helper returns false and the separately
  announced post-window policy takes effect. Labels must not become available at any earlier time.
- Window start/end, timezone/block interpretation and post-window policy are published before v3 registration opens.
- A challenge/fix process covers missing or malformed snapshot records.
- Reserved labels that are not claimed after the window follow the announced release policy; they do not silently become available early.

For the selected live-read policy, reservation uses the immutable v2 contract's current lifecycle.
No off-chain batch or indexer is required. The published deployment evidence must show that the
registry's one-time migration-controller wiring was locked before public registration was enabled.

## State mapping

| V2 state | V3 migration behavior |
|---|---|
| Owner | Becomes v3 owner only after successful claim |
| Expiry | Exact v2 expiry is copied without clamping or free extension; v3 grace must equal v2 grace |
| Resolution/profile | Optional review-and-copy; normalized/URL/text limits revalidated |
| Primary | Re-established by owner with v3 forward-confirmed reverse rules |
| Fixed listing | Not migrated; seller must create a new v3 listing |
| Referral reward | Remains claimable on v2 |
| Seller proceeds | Remains claimable on v2 |
| Reserved/released | Follows separately published eligibility policy |

Offers and auctions have no v2 source state. They begin only on v3.

The migration constructor reads both immutable grace periods and rejects deployment unless they
match exactly. At claim time, ACTIVE/GRACE status must be consistent with the exact v2
expiry and v2 grace period. The registry copies that expiry byte-for-byte and rejects a mapping that
would already be RELEASED on v3. This preserves a late-grace holder's remaining claim/lifecycle
rights without silently granting extra registration time. Any expiry extension requires a separate,
funded and published governance/release policy.

## Migration evidence

Each claim emits and records:

```text
source chain ID
v2 contract and token ID/label
source block or live-read block
proof type/root where applicable
v2 owner and v3 recipient
v3 suite release ID, registry and migration-controller addresses
normalization profile hash and exact canonical label hash
v3 node/token ID
transaction hash and confirmation count
mapped expiry and copied-record hash
```

Evidence follows `docs/TRANSACTION_EVIDENCE.md` and never includes a private key or unredacted signature unrelated to the public transaction.

## Resolver and hosted cutover

1. Run v3 shadow reads without changing canonical resolution.
2. Publish parity/difference reports for eligible migrated names.
3. Announce exact resolver precedence cutover, including separate public-resolver and bounded Universal-Resolver-helper addresses/capabilities.
4. Update manifests, SDK, MCP, metadata and UI together.
5. Keep a clearly labelled v2 lookup/claim path for the announced support period.

No period may present both v2 and v3 as the same canonical registry without deterministic precedence.

## Required tests

- owner/non-owner, active/grace/released/reserved eligibility;
- pre-window reservation from suite activation, inclusive end boundary and pause/read-failure fail-closed behavior;
- duplicate claim and proof replay across chain/controller/root;
- snapshot generation reproducibility and malformed proof rejection;
- transfer between snapshot and claim according to the selected policy;
- exact expiry boundary, source-status consistency, grace-period compatibility and no-unannounced-extension accounting;
- Unicode collision between migrated ASCII and new normalized input;
- migration cannot mint Unicode/noncanonical bytes or bypass the public-registration attestor boundary;
- migration and marketplace addresses match the registry's four-argument one-time locked suite wiring, and all seven addresses plus independent helper bindings match the manifest;
- resolver/text review and unsafe URL rejection;
- v2 liability isolation before/after v3 claims;
- pause, reentrancy and partial hosted cutover recovery.

All rows map to section G of `docs/V3_ACCEPTANCE_MATRIX.md` and are currently `NOT RUN`.
