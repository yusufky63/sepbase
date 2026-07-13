# V3 Full Acceptance Matrix

Status: **selected local/source rows now have reproducible evidence; release rows remain pending**. Passing v2 tests does not satisfy a v3 row, and local Foundry/SDK/API evidence does not satisfy Base Sepolia, hosted-origin, npm-publication, audit, soak or paid-x402 runtime rows.

Evidence columns use `NOT RUN`, `PASS <command/artifact>`, or `BLOCKED <reason>`. A checkbox is not evidence.

Current evidence snapshot (2026-07-13): `pnpm contracts:test` passed 91/91 tests, of which 62 are V3 unit/edge/fuzz/invariant/acceptance tests and 29 are historical v2 tests; `pnpm artifacts:v3:check` passed one positive and ten fail-closed artifact cases for seven modules; normalization validation passed 8 accepted/6 rejected fixtures; SDK 55/55, MCP 34/34, React 4/4 and web 229/229 tests passed. `pnpm packages:smoke` packs all three packages and installs them into an isolated NodeNext consumer, but this is not a public-registry result. `pnpm examples:v3:typecheck` compiles the workspace SDK/Viem/Wagmi/React/MCP consumer fixture, but does not cover Cast or deployed-V3 runtime behavior. `V3_MIGRATION_SOURCE_BLOCK=44054186 pnpm migration:v3:dry-run` reproducibly generated `evidence/v3-migration/84532-44054186.json` (6/6 active names eligible; embedded `reportSha256` `492ab72338895dc101b3ce4b0b4bb1971d7521fd9797c28ddb20882ded5b4551`), but this is preflight only. Production draft deployment `dpl_5UDQ59oGJX6An7NKnnEYf3dHBgEj` passed canonical-origin smoke for four pages, eight ABI artifacts, eight v2 plus 39 V3 MCP tools, production-authenticated free x402 quotes, disconnected desktop/mobile browser rendering and a one-hour zero-error runtime-log query; evidence is `evidence/hosted-release/2026-07-13-draft-production.json`. All seven V3 addresses remain null and paid execution remains unavailable, so this does not satisfy live-V3 final-origin rows. npm workflow `29246024626` passed validation and emitted signed SDK provenance, but npm rejected it with `E422` because the source GitHub repository is private; I01 remains unrun. No V3 deployment, migration claim, funded wallet flow, public npm install, audit, soak, external attestation issuer or funded paid execution was run.

## A. Normalization and ENS

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| A01 | ASCII, composed/decomposed Unicode and case variants | ENSIP-15 canonical output matches shared corpus | PASS `pnpm normalization:validate` + `pnpm --filter @sepbase/sdk test` (`normalization.test.ts`) |
| A02 | Confusable, mixed-script, invalid emoji/sequence | Typed rejection on web/SDK/MCP/controller | PASS `pnpm test` (`normalization.test.ts`, `v3-integration-lab.test.tsx`, `v3-tools.test.ts`) + `pnpm contracts:test` (`test_MixedScriptCannotBypassNormalizationAttestor`) |
| A03 | Raw variants normalize to one label | Same labelhash/namehash/commitment identity | NOT RUN |
| A04 | Forward resolve | Dedicated simple Universal Resolver helper returns supported address result and resolver address | PASS `pnpm contracts:test` (`test_ResolverRegistryExtendedAndUniversalForwardReverseConformance`) |
| A05 | Reverse candidate with matching forward owner/address | Verified primary returned | PASS `pnpm contracts:test` (`test_ResolverRegistryExtendedAndUniversalForwardReverseConformance`) |
| A06 | Spoofed/stale reverse candidate | Address fallback; no trusted display name | PASS `pnpm test` (`v3-client.test.ts`, `v3-identity.test.tsx`, `v3-tools.test.ts`) |
| A07 | Text set/read/clear and byte limits | Correct events, no unsafe rendering | PASS `pnpm contracts:test` (`test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles`) |
| A08 | Transfer/migration | Old identity text cannot impersonate new owner | PASS `pnpm contracts:test` (`test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles`) |
| A09 | ERC-165/ENS interface matrix | Only implemented interfaces return true; public and Universal resolver profiles remain distinct | PASS `pnpm contracts:test` (`test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles`) |
| A10 | Valid normalization attestation | EIP-712 domain plus profile/chain/controller/label/recipient/expiry binding matches the exact commitment attestation hash | PASS `pnpm contracts:test` (`test_NormalizationAttestationHelperSemanticsAndHashVector`, `test_ERC1271NormalizationAttestorAcceptsApprovedAndRejectsInvalidSignature`) |
| A11 | Forged, expired, overly long-lived or wrong chain/controller/profile/label/recipient attestation | Controller rejects before payment/state | PASS `pnpm contracts:test` (`test_A11_AttestationScopeAndLifetimeBindingsRejectBeforeState`) |
| A12 | Direct contract caller submits arbitrary Unicode without a matching attestation | Bounded label checks plus attestor verification reject canonicality self-assertion | PASS `pnpm contracts:test` (`test_MixedScriptCannotBypassNormalizationAttestor`) |
| A13 | Owner attempts to rotate attestor | No setter/path exists; replacement requires reviewed controller/suite release and manifest cutover | PASS `pnpm artifacts:v3:check` (immutable getter/source/ABI validation plus mutability drift rejection) |
| A14 | Resolver unsupported profiles | Contenthash, CCIP-Read, smart multicall and unsupported selectors are absent/fail explicitly; no full official-UR claim | PASS `pnpm contracts:test` (`test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles`) |

## B. Commit-reveal registration

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| B01 | Valid commit, minimum age, reveal | Name mints once with exact terms | PASS `pnpm contracts:test` (`test_CommitRevealRejectsEarlyAndCopiedRevealThenRegistersOnce`) |
| B02 | Reveal before minimum age | Revert before payment/state | PASS `pnpm contracts:test` (`test_CommitRevealRejectsEarlyAndCopiedRevealThenRegistersOnce`) |
| B03 | Reveal after maximum age | Revert; commitment cannot be reused | PASS `pnpm contracts:test` (`test_B03_B08_ExpiredAndConcurrentRevealCannotMintOrConsumeTwice`) |
| B04 | Copied reveal/front-run sender | Cannot redirect owner/recipient or steal name | PASS `pnpm contracts:test` (`test_CommitRevealRejectsEarlyAndCopiedRevealThenRegistersOnce`, `test_AttestationExpiredAndWrongRecipientAreTypedFailures`) |
| B05 | Wrong chain/controller/name/payer/owner/duration/referrer/attestation hash/secret | Commitment mismatch | PASS `pnpm contracts:test` (`test_B05_CommitmentBindsEveryRegistrationDimension`) |
| B06 | Price or referral BPS changes after commit | Expected guard reverts before collection | PASS `pnpm contracts:test` (`test_CommitmentExpirySecretChainPriceAndReferralGuards`) |
| B07 | Pause/insolvency after commit | Reveal fail-closed; recovery state clear | PASS `pnpm contracts:test` (`test_B07_PauseAndInsolvencyAfterCommitFailClosedWithoutConsumption`) |
| B08 | Duplicate reveal and concurrent requests | Exactly one registration | PASS `pnpm contracts:test` (`test_B03_B08_ExpiredAndConcurrentRevealCannotMintOrConsumeTwice`) |
| B09 | Native and 6-decimal ERC-20 | Exact accounting and allowance behavior | PASS `pnpm contracts:test` (`test_CommitRevealRejectsEarlyAndCopiedRevealThenRegistersOnce`, `test_SixDecimalRegistrationAndFixedSaleExactDelta`) |
| B10 | Fee-on-transfer/rebasing mock | Exact-delta mismatch rejection | PASS `pnpm contracts:test` (`test_FeeOnTransferSettlementRejectedBeforeMint`, `test_RebasingSettlementRejectedBeforeRegistrationState`) |
| B11 | Attestation expires or is replaced between commit and reveal | Old reveal rejects; new attestation requires a new commitment, with no silent retry | PASS `pnpm contracts:test` (`test_B11_AttestationExpiryOrReplacementRequiresNewCommitment`) |

## C. Fixed listings

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| C01 | Owner list/update/cancel | Nonce, price, expiry and fee snapshot correct | PASS `pnpm contracts:test` (`test_FixedListingBuyUsesPullProceedsAndFeeSurplus`, `test_ListingNonceIncrementsOnUpdateAndOldBuyCannotReplay`) |
| C02 | Operator/non-owner list | Rejected | PASS `pnpm contracts:test` (`test_C02_C03_C04_C06_FixedListingGuardsAndStaleOwnership`) |
| C03 | Price/fee changes before buy/update | Expected guard before collection/state | PASS `pnpm contracts:test` (`test_C02_C03_C04_C06_FixedListingGuardsAndStaleOwnership`) |
| C04 | Transfer/expiry/re-registration/migration | Listing invalidated exactly once | PASS `pnpm contracts:test` (`test_C02_C03_C04_C06_FixedListingGuardsAndStaleOwnership`) |
| C05 | Buy native/ERC-20 | Exact collection, NFT transfer, seller liability | PASS `pnpm contracts:test` (`test_FixedListingBuyUsesPullProceedsAndFeeSurplus`, `test_SixDecimalRegistrationAndFixedSaleExactDelta`) |
| C06 | Buyer=seller, stale seller, non-ACTIVE | Rejected before collection | PASS `pnpm contracts:test` (`test_C02_C03_C04_C06_FixedListingGuardsAndStaleOwnership`) |

## D. Offers

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| D01 | Create offer | Exact escrow and offer liability | PASS `pnpm contracts:test` (`test_OfferCancellationAndAcceptancePreserveUnifiedLiability`) |
| D02 | Accept | NFT to intended recipient; seller proceeds credited | PASS `pnpm contracts:test` (`test_OfferCancellationAndAcceptancePreserveUnifiedLiability`) |
| D03 | Cancel before accept | Offer terminal; buyer refund claimable | PASS `pnpm contracts:test` (`test_OfferCancellationAndAcceptancePreserveUnifiedLiability`) |
| D04 | Expire | Permissionless expiry; buyer refund claimable | PASS `pnpm contracts:test` (`test_D04_D05_D06_OfferExpiryStalenessAndTerminalPathsAreSingleUse`) |
| D05 | Ownership/lifecycle nonce changes | Accept blocked; refund path remains | PASS `pnpm contracts:test` (`test_D04_D05_D06_OfferExpiryStalenessAndTerminalPathsAreSingleUse`) |
| D06 | Concurrent accept/cancel/refund | One terminal path, no double spend | PASS `pnpm contracts:test` (`test_D04_D05_D06_OfferExpiryStalenessAndTerminalPathsAreSingleUse`) |
| D07 | Recipient/seller/buyer contract callbacks | Reentrancy cannot corrupt offer/liability state | PASS `pnpm contracts:test` (`test_OfferReceiverCallbackCannotReenterProtectedAccounting`) |

## E. English auctions

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| E01 | Schedule/start with valid expiry window | NFT custody and parameters correct | PASS `pnpm contracts:test` (`test_AuctionOutbidExtensionFinalizeAndDeliveryBeforeSellerCredit`) |
| E02 | Below reserve/min increment/late bid | Rejected before escrow mutation | PASS `pnpm contracts:test` (`test_E02_E05_E08_ReserveFailureCancelAndNoBidFinalizeAreSafe`) |
| E03 | First/highest/outbid | Exact escrow; prior bidder pull refund | PASS `pnpm contracts:test` (`test_AuctionOutbidExtensionFinalizeAndDeliveryBeforeSellerCredit`) |
| E04 | Anti-sniping bid | Bounded deterministic extension | PASS `pnpm contracts:test` (`test_E04_E06_E07_AuctionExtensionIsBoundedAndFinalizeIsSingleUse`) |
| E05 | Cancel before first bid | NFT returned; no stranded liability | PASS `pnpm contracts:test` (`test_E02_E05_E08_ReserveFailureCancelAndNoBidFinalizeAreSafe`) |
| E06 | Cancel after valid bid | Rejected | PASS `pnpm contracts:test` (`test_E04_E06_E07_AuctionExtensionIsBoundedAndFinalizeIsSingleUse`) |
| E07 | Finalize reserve met | NFT winner, seller proceeds, fee; single-use | PASS `pnpm contracts:test` (`test_E04_E06_E07_AuctionExtensionIsBoundedAndFinalizeIsSingleUse`) |
| E08 | Finalize reserve unmet | NFT seller, refunds claimable | PASS `pnpm contracts:test` (`test_E02_E05_E08_ReserveFailureCancelAndNoBidFinalizeAreSafe`) |
| E09 | GRACE/RELEASED during auction | No active-identity sale; deterministic recovery | PASS `pnpm contracts:test` (`test_E09_ExpiryWindowRejectsUnsafeAuctionAndLateFinalizeRefundsBidder`) |
| E10 | Reentrant bidder/receiver | No duplicate refund/finalization | PASS `pnpm contracts:test` (`test_ReentrantBidSettlementCallbackCannotDuplicateEscrowOrRefunds`, `test_AuctionFinalizesToBoundContractRecipientWithoutCallbackAndWhilePaused`) |

## F. Unified liabilities and invariants

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| F01 | Referral+seller+offer+bid+x402 liabilities | Sum equals `totalProtectedLiability` | NOT RUN |
| F02 | Treasury withdrawal | Only verified surplus transferred | PASS `pnpm contracts:test` (`test_F02_F03_F05_PauseClaimsAndTreasurySolvencyRemainSafe`) |
| F03 | Insolvency fixture | New exposure blocked; cancel/refund/claim open | PASS `pnpm contracts:test` (`test_F02_F03_F05_PauseClaimsAndTreasurySolvencyRemainSafe`) |
| F04 | Failed native/ERC-20 payout | Full state revert | PASS `pnpm contracts:test` (`test_ListingStaleSelfPurchaseAndPayoutFailureRemainSafe`, `test_FailedERC20ClaimsRevertWithoutReducingControllerOrMarketplaceLiability`) |
| F05 | Alternate claim recipient | Checksum/input rules and exact payout | PASS `pnpm contracts:test` (`test_F02_F03_F05_PauseClaimsAndTreasurySolvencyRemainSafe`) |
| F06 | Stateful invariant sequence | Balance never below liabilities on supported path | PASS `pnpm contracts:test` (`invariant_ControllerAndMarketplaceRemainIndividuallySolvent`, 128 runs/8,192 calls) |
| F07 | Marketplace/MarketLens enumeration, bounds and nonces | 50-result/100-scan bounds, raw cursor progress, pinned-block dedupe; no duplicate active object or stale acceptance | PASS `pnpm contracts:test` (`test_MarketLensSwapPopPaginationRequiresPinnedBlockOrCursorRestart`) + `pnpm test` (`v3-market-pagination.test.ts`, `v3-market-name-context.test.ts`) |

## G. Migration

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| G01 | Eligible active/grace v2 owner | One matching v3 claim | PASS `pnpm contracts:test` (`test_MigrationReservesEligibleV2AndPreservesExpiryWithoutLiabilityImport`, `test_MigrationPreservesExactGraceExpiryAndRejectsInconsistentSourceState`) |
| G02 | Non-owner/stale snapshot/duplicate proof | Rejected | PASS `pnpm contracts:test` (`test_MigrationOwnerResolutionAndWindowGuards`, `test_MigrationReservesEligibleV2AndPreservesExpiryWithoutLiabilityImport`) |
| G03 | Reserved migration name | Public commit-reveal blocked during window | PASS `pnpm contracts:test` (`test_MigrationReservationClosesPreWindowPublicRegistrationRace`, `test_MigrationReservationEndsOnlyAfterInclusiveAnnouncedWindow`, `test_MigrationReservationReadFailureFailsClosed`) |
| G04 | Expiry mapping | V3 expiry never silently shortens v2 right | PASS `pnpm contracts:test` (`test_MigrationReservesEligibleV2AndPreservesExpiryWithoutLiabilityImport`, `test_MigrationPreservesExactGraceExpiryAndRejectsInconsistentSourceState`, `test_MigrationExpiryBoundariesRemainInclusiveWithoutExtension`) |
| G05 | Resolver/text opt-in | User review; no silent unsafe copy | NOT RUN |
| G06 | V2 referral/seller liabilities | Remain isolated and claimable on v2 | NOT RUN |
| G07 | Resolver precedence cutover | One documented canonical answer at each phase | NOT RUN |
| G08 | Migration normalization boundary | Only exact canonical historical v2 ASCII enters the migration path; no Unicode/public-attestation bypass or normalized collision | PASS `pnpm contracts:test` (`test_MigrationRejectsLabelsOutsideTheExactHistoricalV2AsciiGrammar`) + SDK/MCP exact-byte tests |

## H. Web wallet UX

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| H01 | Desktop/375px Unicode search | Normalized review, no overflow | NOT RUN |
| H02 | Commit/reveal states | Commit receipt, timer, reveal retry/expiry clearly separated | NOT RUN |
| H03 | Fixed list/buy | Fresh seller/owner/status/price/fee and resolution behavior shown | NOT RUN |
| H04 | Offer create/cancel/accept/refund | Escrow and recipient explicitly confirmed | NOT RUN |
| H05 | Auction bid/outbid/finalize | Highest bid, refund and extension states accessible | NOT RUN |
| H06 | Referral/proceeds/refunds | Loading/unavailable/zero distinct; alternate recipient supported | NOT RUN |
| H07 | Wrong network/disconnected/rejected signature | Recoverable without state loss | NOT RUN |
| H08 | Keyboard/screen reader/reduced motion | WCAG AA target and tab/dialog patterns pass | NOT RUN |

## I. SDK, npm, MCP and examples

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| I01 | npm install in clean fixture | Exact public versions install with provenance | NOT RUN |
| I02 | TypeScript/Viem/Wagmi/Cast snippets | Compile/run against fixture; no undefined placeholders | NOT RUN |
| I03 | Seven-address manifest/ABI/version/profile/fixture/attestor or helper-binding mismatch | Typed fail-closed error before reads/writes are trusted | PASS `pnpm artifacts:v3:check` (1 positive + 10 fail-closed drift cases) + `pnpm --filter @sepbase/sdk test` (`v3-manifest.test.ts`) |
| I04 | MCP initialize/tools | Version, Origin/body/rate rules and no signer path | PARTIAL: local MCP HTTP tests pass Origin/body/stateless/no-signer rules; Production draft `dpl_5UDQ59oGJX6An7NKnnEYf3dHBgEj` passes canonical-origin smoke with 8 v2 and 39 V3 tools. Hosted rate/abuse load evidence remains NOT RUN |
| I05 | MCP commit/reveal/market plans | Unsigned scoped plan; simulation required | PASS `pnpm --filter @sepbase/mcp test` (`v3-tools.test.ts`, `v3-server.test.ts`) |
| I06 | SSRF/redirect/private-network inputs | Rejected | PASS `pnpm --filter @sepbase/sdk test` (`client.test.ts`, `v3-manifest.test.ts`) |
| I07 | Resolver capability discovery | SDK/MCP route public resolver and simple Universal Resolver calls correctly and reject unsupported CCIP/multicall assumptions | PASS `pnpm contracts:test` (`test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles`, `test_ResolverRejectsMalformedDNSUnsupportedSelectorAndOversizedText`) + `pnpm test` (`v3-client.test.ts`, `v3-tools.test.ts`) |

## J. Paid x402 V2

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| J01 | No payment | Correct `402 PAYMENT-REQUIRED` choices | SOURCE PASS `paid-route.test.ts`, `official-adapter.test.ts`; hosted live negotiation NOT RUN |
| J02 | Valid payment | Durable order, commit/reveal, confirmation, settlement | SOURCE PASS `v3-quote-issuer.test.ts`, `workflow.test.ts`; funded Base Sepolia E2E NOT RUN |
| J03 | Duplicate/concurrent payment identifier | One order/execution; same status response | SOURCE PASS authorization hash + CAS/fencing/replay tests; distributed-service E2E NOT RUN |
| J04 | Expired/stale/cross-scope payment | Rejected without keeper spend | SOURCE PASS quote/plan/official-adapter policy tests; funded E2E NOT RUN |
| J05 | Crash after commit/submission/confirmation | Resume/reconcile; no blind replay | SOURCE PASS encrypted reservation reload + Workflow continuation + CAS response-loss tests; recovery drill NOT RUN |
| J06 | Registration failure after verified/captured payment | Refund liability and SLA evidence | SOURCE PASS settle-after-confirm and `manual-review` reconciliation state; external facilitator refund/SLA drill NOT RUN |
| J07 | Facilitator timeout/response loss | Status reconciliation before retry | SOURCE PASS settlement-timeout and `/api/x402/registration/status` fail-closed/privacy tests; hosted recovery E2E NOT RUN |
| J08 | Keeper selector/amount/daily limit | Out-of-policy request rejected | SOURCE PASS calldata recomputation, pre-funded balance/allowance/gas and signer policy echo; real managed-signer daily-limit E2E NOT RUN |
| J09 | Secret/log scan | No key, auth, signed payload or private RPC leakage | SOURCE PASS secret-bearing plan stays encrypted and public responses omit hashes/payment; release secret scan still required per final commit |

## K. Hosted release, security and operations

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| K01 | Final-origin discovery | Metadata, seven ABI/address/version checksums, four registry bindings, Universal Resolver/MarketLens bindings, normalization profile/attestor, manifests, OpenAPI, docs and llms parity | NOT RUN |
| K02 | On-chain metadata | HTTPS final origin; wallet/explorer fetch works | NOT RUN |
| K03 | Multisig/timelock/admin | Roles and emergency/non-emergency paths verified | NOT RUN |
| K04 | Independent audit | Findings triaged and critical/high closed | NOT RUN |
| K05 | Observability | Synthetic checks and alerts for every critical dependency | NOT RUN |
| K06 | Backup/restore | Durable x402 store recovery and reconciliation drill | NOT RUN |
| K07 | Incident drill | Pause new risk while refund/claim/recovery remains available | NOT RUN |
| K08 | Base Sepolia soak | Defined duration/load with no unresolved critical event | NOT RUN |
| K09 | One-time suite configuration | Immutable configurator wires controller/public resolver/migration/marketplace exactly once; owner is separate; repeat/invalid wiring rejects | NOT RUN |
| K10 | Attestor incident/replacement drill | Loss/compromise halts new registration safely and follows new-controller/suite cutover without mutating existing names | NOT RUN |

## Required command baseline

```bash
forge fmt --check
forge build
forge build --sizes
forge test -vvv
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec tsx scripts/validate-integration-artifacts.ts
```

Additional V3 browser, Base Sepolia, hosted, npm-consumer, audit, soak and paid-execution suites are still required. Any row that remains `NOT RUN` is pending even if an adjacent source test passes.
