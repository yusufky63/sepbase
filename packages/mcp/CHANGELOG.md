# Changelog

All notable changes to `@sepbase/mcp` are documented here.

## Unreleased — v3

- Added the opt-in `createSepbaseV3McpServer` factory backed by `SepbaseV3Client` without changing the legacy hosted server.
- Added the separate `handleSepbaseV3McpPost` stateless HTTP export and explicit `SEPBASE_MCP_SUITE=v3` stdio selection; both preserve legacy defaults.
- Added 16 V3 read tools for canonical normalization, verified resolution, bounded owned-name/account-balance snapshots, registration requirements and quotes, bounded MarketLens pages, liabilities, and migration status.
- Extended `migration_status` with optional account-scoped, exact-label claim eligibility backed by the SDK's pinned v2/V3 policy read.
- Added 23 block-pinned unsigned plan tools for renewal, marketplace (including stale-listing invalidation and per-token marketplace approval), claims, resolver records (including explicit primary clearing), transfers, and migration.
- Kept MCP registration requirements-only: no commitment preimage, attestor output, wallet credential, x402 authorization, signing, payment initiation, or transaction sending crosses the tool boundary.
- Added JSON-safe bigint serialization, configured-decimal formatting, stable error conversion, bounded input validation, and V3 boundary/compatibility tests.

## 0.1.0 — 2026-07-12

- Stateless Streamable HTTP and stdio transports.
- Read-only name, market and protocol tools plus unsigned guarded registration preparation.
