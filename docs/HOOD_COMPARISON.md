# SEPBASE and hood.ag comparison

Status: living technical comparison; last checked 2026-07-12

This document compares the public hood.ag deployment with the historical SEPBASE v2 deployment and the authorized SEPBASE V3 source/release target. It is not a marketing ranking. SEPBASE now has seven V3 contracts plus local artifact/SDK/API/MCP evidence, but a V3 row is not live until deployment and the corresponding release evidence exists in [`V3_ACCEPTANCE_MATRIX.md`](./V3_ACCEPTANCE_MATRIX.md).

Primary hood.ag references:

- <https://www.hood.ag/docs>
- <https://www.hood.ag/llms.txt>
- <https://www.hood.ag/llms-full.txt>
- <https://www.hood.ag/?v=market>
- <https://agents.hood.ag>
- <https://robinhoodchain.blockscout.com/address/0xd37C9f7D1a59bceB2BDa47325f14f5789f1176a1>

## Evidence labels and limits

- **Published claim** means hood.ag documentation or a published package/address says the capability exists; it is not independent runtime proof.
- **Observed HTTP (2026-07-12)** means a non-mutating public HTTP/MCP request returned the described response at check time. Hosted responses can change after this date.
- **Explorer source/ABI observation** means verified proxy/implementation source or ABI exposed the described selector/state path. It supports source-level inference, not a claim that every live configuration or transaction outcome was exercised.
- **Source inference** is an explicit conclusion from that verified code shape. It is not a successful registration, purchase, payment settlement or keeper-broadcast receipt.
- **SEPBASE local evidence** means a named Foundry/package/artifact command passed in this repository. It proves only the cited source scenario, not Base Sepolia V3 deployment, live-V3 hosted parity, audit, soak or paid execution. Public npm and hosted-draft evidence are cited separately.

No Hood wallet signature, payment, market purchase, keeper registration or state-changing transaction was executed for this comparison.

## Executive comparison

| Area | hood.ag evidence-qualified public surface | SEPBASE v2 live baseline | SEPBASE V3 source / release target |
|---|---|---|---|
| Network maturity | Published docs/explorer: Robinhood Chain mainnet, chain 4663 | Base Sepolia test deployment | Base Sepolia operated with mainnet release discipline |
| Naming stack | Published docs + explorer source: registry, registrar, resolver, reverse registrar and Universal Resolver addresses | Standalone ERC-721 name service; not ENS-compatible | Seven no-proxy addresses: six authority/state contracts plus bounded read-only MarketLens |
| Registration | Published docs + controller source: commit-reveal; not transaction-tested here | Direct registration | Commit-reveal with chain/controller/request/price/referral/attestation-hash binding |
| Canonicalization | Public docs claim ENSIP-15 and emoji; observed public surfaces disagree, as recorded below | ASCII `a-z0-9-` | Exact-pinned ENSIP-15 implementation plus a shared Unicode/emoji/confusable corpus |
| Resolution | Published docs/explorer source: addr, multicoin, text, name and contenthash records plus a Universal Resolver entry point; full runtime matrix not exercised here | Forward-confirmed primary and profile reads through the service contract/API | Addr/multicoin/text/name + ENSIP-10 public resolver and bounded ENSIP-23 simple helper; contenthash, CCIP-Read and smart multicall intentionally absent from first profile |
| Marketplace | Explorer source/ABI behind `0xd37C…`: fixed list/buy paths for ETH or USDG; no offer/auction selector observed; no purchase executed | Fixed-price deployment-settlement listings | Fixed listing, escrowed offers, English auctions and separately bounded indexer-free MarketLens reads |
| Seller/referral payout | Source inference: push-first/fallback market payout and product-specific registration/market referral terms | Pull-payment liabilities and explicit solvency guard | Unified pull balances for referrals, proceeds and refunds with exact liability accounting |
| Upgrade trust | Published docs + explorer source: registry described immutable; registrar, resolver, controller and market use owner-gated UUPS proxies | Immutable, no proxy | Seven immutable/no-proxy contracts; four-argument one-time registry wiring, with MarketLens as non-authority view helper |
| Developer discovery | Observed HTTP/package surfaces: public SDK/MCP paths, hosted MCP, `llms.txt` and published addresses | Final HTTPS manifest/ABI/REST/OpenAPI/`llms.txt`, hosted current-v2 MCP and public `@sepbase/*` `0.1.0` with provenance | Hosted schema-4 draft manifest, seven ABIs, V3 read API, 39-tool `/api/v3/mcp`, fail-closed external-attestation proxy and the same public packages; V3 addresses remain null |
| Agent payment | Observed HTTP returned payment negotiation options for the registration resource; no payment, settle or keeper write was executed | Activation-gated official x402 V2 + encrypted plan/order + managed commit/reveal workflow | Source route supports gated `402/202/200` and status reconciliation, but current draft remains `503`; facilitator, durable services, funded E2E and activation pending |

## What hood.ag currently does better

- A real-browser check on 2026-07-12 rendered 351 owner listings with named assets, sellers, prices and enabled `Buy now` controls. The same screen reported no recent completed sales; no purchase was signed in this review, so this proves live inventory/read UI rather than settlement success.
- Published mainnet addresses and explorer source show a conventional ENS-style registry/resolver topology with a Universal Resolver entry point.
- Its verified PublicResolver source includes `contenthash`/`setContenthash`; SEPBASE v3's first resolver profile deliberately does not.
- Its SDK and MCP installation paths are public, and observed HTTP showed the hosted MCP endpoint responding to initialization and read tools at check time.
- The public agent-registration endpoint returned payment negotiation options. Docs/source describe a keeper-mediated path, but this comparison did not prove payment settlement or keeper execution.
- The user documentation explains registration, renewal, primary names, records and wallet import in a compact product-oriented flow.

These remain real deployed ENS/resolver and agent-product advantages over historical SEPBASE v2 and the address-free V3 draft. SEPBASE has closed the basic public package-distribution gap, but package publication does not close deployment or funded-runtime gaps.

## Where SEPBASE is stronger or deliberately stricter

- SEPBASE keeps gas currency and settlement asset separate and does not infer exchange rates or conversions.
- V2 already guards registration amount/referral BPS and marketplace price/fee, tracks protected liabilities and restricts treasury withdrawal to verified surplus.
- V3 uses escrow plus pull-payment accounting for offers, outbid refunds and seller proceeds instead of relying on successful external payout during a sale.
- V3 marketplace custody preparation uses a separate per-token ERC-721 approval plan and refuses list/offer-accept/auction-start planning when that approval is absent at the pinned block; it does not default to blanket operator approval.
- V3 rejects fee-on-transfer settlement behavior with exact sender/recipient balance-delta checks.
- SEPBASE listings bind a fee snapshot/expected-fee guard. **Source inference:** the verified Hood market implementation behind the published proxy stores seller and price while `buy` reads current mutable `feeBps`, so a later admin fee change can change seller proceeds for an already listed name.
- V3 publishes a single canonical normalization profile and conformance corpus for web, SDK, MCP and contracts.
- V3 now has a bounded browser pending-session format and a same-origin normalization-attestation proxy that verifies the exact external EIP-712 signer response locally. It remains unavailable while the manifest is draft and does not embed a signer or private key.
- V3 intentionally uses six immutable/no-proxy authority/state contracts plus one bounded read-only MarketLens rather than owner-upgradeable registrar/resolver/market proxies; four registry state bindings are performed once by a separate immutable configurator, while helper bindings are verified independently.
- V3 deliberately limits resolver scope to addr/multicoin/text/name, ENSIP-10 extended dispatch and a separate ENSIP-23 simple helper. Hood's source-level contenthash support is broader; SEPBASE does not disguise missing contenthash, CCIP-Read or smart multicall as Universal Resolver parity.
- V3 x402 targets the current CAIP-2 network form and official V2 packages, with durable authorization-level replay deduplication and a managed signer boundary.
- V3 commitments bind chain, controller, canonical name, payer/recipient, duration, resolver initialization, immutable-attestor hash, referrer and expected economic guards. **Source inference:** the verified Hood controller commitment binds label, owner and secret; duration and live price are checked later but are not part of that commitment.

Foundry, artifact, SDK, V3 API and MCP source evidence is attached for selected acceptance rows: `pnpm contracts:test` passes 62 V3 tests within 91/91 total, and the seven-module validator plus SDK/MCP/React package tests are green. Public workflow `29246721839` published the three `0.1.0` packages with provenance, and anonymous exact-version consumer smoke passed. The on-chain V3 advantages remain release claims—not deployed product advantages—until Base Sepolia transactions, live-V3 final-origin parity, audit and soak are attached. Paid x402 remains absent.

## Observed hood.ag documentation/runtime drift

The following checks were non-mutating. They did not sign, pay or submit a transaction.

1. **Published claim/source drift:** the main docs say names support emoji, use ENSIP-15, reject mixed-script/confusable input and have a two-character minimum. `llms-full.txt` instead says lowercase ASCII only and a three-character minimum. Explorer source implements controller `valid(string)` as a byte-length check, while hosted surfaces apply different validation.
2. **Observed HTTP:** hosted MCP `check_availability` accepted an emoji ZWJ label and a Cyrillic/Latin mixed-script label as available, while the agent quote endpoint rejected the same inputs with `a-z 0-9 - only`.
3. **Observed HTTP:** docs describe x402 V2, but an unauthenticated `POST /register` returned an envelope whose `x402Version` was `1` and whose networks used legacy names such as `base`, rather than the documented V2 CAIP-2 form. No payment was submitted.
4. **Observed HTTP:** docs list a `register_name` MCP tool, but hosted `tools/list` exposed five read tools and did not include `register_name` at check time.
5. **Published claim/explorer source drift:** the docs' contract table omits the marketplace address even though the application bundle and explorer expose a separate UUPS market proxy/implementation. Explorer ABI/source showed fixed listing/buy paths only; absence of observed offer/auction selectors is not proof about unpublished future code.

These are parity findings, not proof that every underlying operation fails. They show why SEPBASE release checks treat docs, manifest, MCP inventory, payment negotiation and on-chain configuration as one atomic release surface.

The hood source observations also explain two deliberate SEPBASE guards: a reveal carries an exact expected amount/referral rate, and a marketplace listing carries an expected fee snapshot. Those guards make an administrator or stale client unable to silently change the economic terms between preparation and execution.

## Marketplace and purchase safety

### Historical SEPBASE v2

The fixed-price contract path verifies that the listing exists, the name is ACTIVE, the seller still owns it, buyer and seller differ, and the submitted expected price equals the stored price. Settlement is collected exactly, the listing is removed, proceeds become a seller liability, and the NFT transfers atomically. Claims use a chosen recipient and revert the whole state transition if payout fails.

The local read-only `/api/market` check on 2026-07-12 returned a healthy, unpaused and solvent V2 marketplace at Base Sepolia block `44057787`, but its active listing page was empty. That is a valid empty state, not evidence of a successful live purchase; a non-empty funded fixture and transaction receipt are still required before describing the current hosted buy/sell flow as end-to-end proven.

This makes the on-chain fixed-price path materially safer than an unguarded UI purchase. It does not mean every UI/RPC condition is perfect: the v3 work also fixes stale dialog data, partial RPC reads being displayed as zero/unavailable, alternate claim-recipient UX and ERC-20 approval preflight.

### SEPBASE v3 acceptance requirement

No market mechanism is called release-ready merely because it compiles or passes local tests. Foundry evidence now marks the selected fixed-listing guard/stale-owner paths, offer expiry/staleness/single-terminal paths, auction reserve/cancel/bounded-extension/finalization/expiry-recovery paths, native and six-decimal ERC-20 accounting, fee-on-transfer/rebasing rejection and selected solvency/claim paths `PASS`. This is contract-source evidence only. The remaining matrix still requires callback/reentrancy rows, failed-payout and MarketLens enumeration rows, funded browser fresh-read/simulation flows, a non-empty deployed market fixture and Base Sepolia transaction receipts.

The authoritative status is the acceptance matrix, not this comparison.

## Bottom line

Based on published addresses/packages and the time-bounded HTTP/explorer observations above, hood.ag remains ahead in deployed ENS-style, contenthash and agent execution surfaces. This is not a claim that a Hood payment or keeper registration succeeded in this review. Historical SEPBASE v2 is simpler and has stronger explicit liability/expected-value protections, but lacks ENSIP-15, text-record standards, commit-reveal, offers, auctions and paid agent execution. SEPBASE V3 now has materially broader locally tested marketplace/accounting source, public provenanced packages and stricter release truthfulness, while deliberately narrower than Hood in resolver features such as contenthash; it becomes the stronger deployed product only after V3 deployment, funded E2E, audit, soak and live-V3 hosted gates pass.
