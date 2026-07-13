# Changelog

All notable changes to `@sepbase/sdk` are documented here.

## Unreleased — v3

- ENSIP-15 normalization and ENS-compatible registry/resolver helpers.
- Commit/reveal registration planning.
- Fixed listing, offer, auction, bounded owned-name/account-balance, liability and migration reads.
- Schema-v4 seven-contract manifest parsing with canonical release-ID verification.
- Runtime ABI/codehash/VERSION/wiring/config parity before V3 client construction.
- Guarded unsigned plans for registration, record updates and explicit primary-name clearing, transfers, fixed sales, offers, auctions, claims and migration.
- Exact-byte legacy migration validation plus block-pinned `getMigrationEligibility` reads for window, reservation, lifecycle, owner, expiry and optional address-record review.
- Guarded stale-listing cleanup through `prepareInvalidateListing`, with fresh listing/registry reads before plan construction.
- Least-authority per-token marketplace approval planning through `prepareMarketplaceApproval`; no blanket approval is generated.
- Approval/staleness preconditions on list, offer-accept, auction-start, listing-update and buy planning, all pinned to the plan block.
- Exact controller EIP-712 digest plus distinct committed-attestation hash conformance.

## 0.1.0 — 2026-07-12

- Manifest-validated v2 name, profile, quote and marketplace reads.
- Forward-confirmed identity verification and typed transport errors.
- Origin-locked manifest resources and single-block snapshots.
