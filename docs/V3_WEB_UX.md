# SEPBASE v3 web interaction contract

Status: implementation UX specification; browser evidence pending
Last updated: 2026-07-13

The v3 interface keeps the existing Modular Typography direction: black/white, configured Base Blue, 12-column grid, 1px rules and strong spacing. It does not become a generic dashboard or bento landing page. This document defines the state and safety behavior that the UI must implement around the v3 contracts.

## Global transaction rules

- Every write starts from a fresh same-block read of all displayed guards.
- Loading, unavailable, zero and empty are distinct states.
- RPC failure disables the affected action and never becomes `available`, `0`, `OPEN` or a manifest fallback price.
- Wallet chain, live suite bytecode/version, ABI checksums and manifest consistency are verified before simulation.
- The exact recipient, settlement asset/decimals, amount, fee, expiry/deadline and object nonce are shown before signature.
- Simulation occurs immediately before wallet submission. A failed simulation refreshes state and preserves user input.
- Receipt success is followed by event and post-state reconciliation before the interface says complete.
- Dialogs can close with Escape unless a wallet/transaction state makes accidental dismissal unsafe; a deliberately locked state still exposes an accessible explicit close/cancel path when possible.

## Registration: normalize, commit, reveal

The registration flow is a three-state transaction, not one “Register” button.

### 1. Normalize and review

- Accept raw UTF-8 or one optional configured suffix.
- Show raw input and canonical label when they differ.
- Require explicit confirmation of the canonical output before requesting an attestation or signature.
- Display typed errors for disallowed sequence, mixed script/confusable, wrong suffix, subdomain, code-point limit and byte limit.
- Request a short-lived normalization attestation only after wallet/recipient selection. Show the manifest profile identifier/hash, checksum attestor, controller and `validUntil` in review details; the signed scope is profile + chain + controller + exact normalized label hash + recipient + expiry.
- Verify the EIP-712 signature locally against the immutable manifest attestor before commitment preparation. The attestor is not the user's transaction signer and does not own or transfer the name.

### 2. Commit

- Generate the secret locally with a cryptographically secure source.
- Store pending commitment state device-locally with the versioned bounded session helper, scoped by suite release/chain/controller/account/commitment and exact normalization-attestation hash; never in URL, analytics or logs. Local storage is not an XSS security boundary, so recovery export is explicit and strong CSP/third-party-script discipline remains mandatory.
- Request normalization signatures only through the same-origin `/api/v3/normalization-attestation` boundary. It is candidate/live-only, has no local signer/private-key option, and verifies the external issuer response before returning it to the browser.
- Show commitment transaction hash, confirmation, earliest reveal time, commitment expiry and attestation `validUntil`. The UI must ensure the attestation window can reach reveal readiness.
- Preserve recovery instructions/export without exposing the secret to third-party telemetry.

### 3. Reveal

- Enable only after minimum age and re-read availability, pause, solvency, price and referral BPS.
- If price/referral terms changed, show the new terms and require a new guarded reveal/commit where the contract requires it; never silently overpay.
- Distinguish too early, ready, wallet rejected, reverted, commitment expired, attestation expired, name taken and confirmed. A replacement attestation changes the commitment hash and requires a new commit; it is never a silent retry.
- On success reconcile owner, resolver address, expiry, referral liability and normalized full name.

## Name page

The name route uses the normalized label in the URL and renders:

- lifecycle, owner, expiry and renewal timing;
- verified EVM address record and multicoin records;
- primary/reverse verification result;
- bounded text records such as avatar, URL, description, `com.twitter` and `com.github`;
- fixed listing, active offers and auction state;
- contract/module/explorer evidence appropriate to the action.

Integration details distinguish `ChainNameResolverV3` record/ENSIP-10 reads from the separate bounded `ChainNameUniversalResolverV3` ENSIP-23 simple resolve/reverse helper. The first profile does not expose contenthash, and the UI does not advertise CCIP-Read, smart multicall or full official ENS Universal Resolver parity.

Owner actions include renew, edit records, set/clear primary, transfer, list/update/cancel, accept/refund offers and auction management. Transfer/sale confirmation explicitly says owner-bound records are cleared/version-invalidated.

## Market

The `/market` route has three keyboard-operable views sharing one visual table language:

1. Fixed listings — name, seller, expiry, price, fee snapshot and buy/manage.
2. Offers — name, offerer, intended recipient, amount, expiry, ownership nonce and status.
3. Auctions — name, seller, reserve, highest bid/bidder, start/end, extension state and finalize/claim status.

Filters and sort controls operate only on fully loaded data. A partial detail-read failure makes the page unavailable or marks the specific row unverifiable; it never silently removes a stored listing and then reports “no listings”. Pagination/cursors retain the snapshot block where supported.

The pending V3 UI discovers `ChainNameMarketLensV3` as a separate seventh manifest address. Lens pages are pinned to one block, request at most 50 returned items and scan at most 100 raw entries; `nextCursor` is a raw index and swap-pop can reorder later pages. The client deduplicates token/offer IDs, preserves the pinned block, displays `stale` and terminal offer states explicitly, and revalidates registry/marketplace state before writes. Missing or mismatched lens data is “unavailable”, never an empty-market proof. The lens is not authority, custody or an indexer.

### Fixed buy

Opening the dialog fresh-reads listing, owner, ACTIVE lifecycle, ownership/listing nonce, price and fee. ERC-20 balance/allowance and simulation are checked against the marketplace address. Approval is exact by default and cannot be submitted while deployment/health reads are incomplete.

### Offer

Creation shows escrow amount, recipient, expiry and refund rules. Accept rechecks seller/ownership nonce and shows seller proceeds/fee. Cancel or expire explains that funds become a pull refund and provides the claim action.

### Auction

Start shows NFT custody, reserve, start/end, minimum increment and bounded anti-sniping policy. Bid shows current minimum, exact escrow and prior-bid refund semantics. Finalize is permissionless and explains NFT/proceeds/refund outcome before submission.

## Account workspace

The `/me` route remains one account view with responsive, ARIA-compliant tabs. ArrowLeft/ArrowRight, Home and End implement roving focus; inactive tabs have `tabIndex=-1`.

Recommended tabs:

- Names — ownership, lifecycle, expiry, primary and records.
- Referrals — link, accrued rewards and claim.
- Listings & proceeds — fixed listings and seller proceeds.
- Offers & bids — created/received offers, auction bids and actionable terminal states.
- Refunds — offer/bid/refund liabilities and reconciliation state.

Claim actions default to the connected wallet but accept a checksum-validated alternative recipient. The UI shows the selected recipient in the confirmation and post-receipt evidence. A failed balance read disables claim; it does not display zero.

### V2 migration claim

The Names view includes a separate v2→v3 claim section only for candidate/live V3 manifests. It accepts the exact historical lowercase ASCII v2 label without a suffix and never trims, case-folds or Unicode-normalizes it. Before enabling claim, one confirmed block must agree on the published migration contract/source chain/legacy registry/window, pause state, reservation, v2 lifecycle, v2 owner, exact expiry and v2 address record. Owner mismatch and unavailable RPC are distinct from ineligibility. The user selects the V3 owner and explicitly chooses either that recipient or the pinned v2 address as the initial V3 address record. Listings, text records and primary-name state are not copied. The final SDK plan rebinds expected legacy owner and optional expected legacy resolution so a changed v2 state reverts before mint.

## Accessibility and mobile

- Target WCAG 2.2 AA for color, keyboard, focus visibility, labels, errors and reduced motion.
- Icon-only actions have an accessible name and tooltip.
- Dialog focus is trapped, returned to the opener and testable with keyboard alone.
- Timers expose textual timestamps and do not rely on animation or color.
- Tables become labelled stacked rows at 375px without horizontal document overflow.
- Transaction status uses `role=status`; actionable failures use `role=alert` without repeatedly stealing focus.
- Canonical Unicode is never truncated in the confirmation; secondary tables may use safe visual truncation while preserving full accessible/title text.

## Release browser stories

At minimum, desktop and 375px automated/manual stories cover:

- valid ASCII, composed/decomposed Unicode, emoji and invalid confusable search;
- commit, reload recovery, earliest reveal, expired reveal and success;
- resolver/text set/read/clear and verified reverse;
- fixed list/update/cancel/buy plus stale dialog refresh;
- offer create/cancel/expire/refund/accept;
- auction create/bid/outbid/extend/finalize/cancel;
- alternate claim recipient;
- disconnected, wrong chain, rejected signature, RPC outage and partial multicall failure;
- screen-reader names, tab/dialog keyboard behavior, reduced motion and mobile overflow;
- console/network inspection with no commitment secret, attestor-service authentication credential or raw payment payload leakage. The on-chain attestation signature is public calldata after reveal but must not be placed in URLs or third-party analytics.
