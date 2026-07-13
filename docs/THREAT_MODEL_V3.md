# SEPBASE v3 threat model

Status: implementation threat model; acceptance and independent audit pending
Last updated: 2026-07-12

This model covers seven Base Sepolia v3 addresses: six authority/state contracts for registry, controller, public resolver, Universal Resolver helper, marketplace and migration plus bounded read-only MarketLens, together with hosted API/MCP surfaces and paid x402 workflow. Base Sepolia assets have no guaranteed financial value, but all controls are designed as if the same code and operational mistakes could later affect a value-bearing deployment.

## Security objectives

1. One ENSIP-15 canonical label maps to one token/node identity.
2. A public registration cannot be front-run into a different recipient, duration, resolver state, referrer or price.
3. A transfer or sale cannot leave the previous owner's forward/reverse/text identity trusted as the new owner's identity.
4. Fixed sales, offers and auctions cannot lose escrow, double-pay, double-refund or spend protected liabilities as treasury surplus.
5. A payment, x402 authorization or keeper retry cannot produce more than one registration or settlement.
6. RPC, UI, API or index-read failure cannot be interpreted as availability, zero balance, zero price or successful identity verification.
7. An owner, keeper, facilitator, attestor or hosted service compromise has a bounded and documented blast radius.

## Protected assets

- name ownership, expiry and resolver control;
- canonical label, labelhash, namehash and normalization-profile binding;
- registration payments and referral liabilities;
- fixed-sale proceeds, offer escrow/refunds and auction bid/refund/proceeds;
- x402 payment authorizations, order uniqueness and keeper spend;
- migration eligibility and one-time claim state;
- owner/treasury/pause roles and deployment provenance;
- private signer material, service credentials and authenticated RPC URLs.

## Actors and trust boundaries

| Actor/boundary | Authority | Explicit non-authority |
|---|---|---|
| Name owner | Transfer token; manage approved resolution/text/primary state; trade name | Cannot bypass lifecycle, settlement or another owner's records |
| Registry/controller | Mint/renew and enforce lifecycle/commit/economic guards | Cannot normalize arbitrary Unicode without an attested proof |
| Normalization attestor | Sign a short-lived statement that exact bytes are canonical under the published profile | Cannot transfer names, change price, receive payment or alter an existing label |
| Marketplace | Escrow approved names/funds and credit pull balances | Cannot mint, renew or withdraw protected liabilities |
| MarketLens | Read bounded marketplace pages and project stale/terminal offer state | Cannot write, hold custody/approval, authorize settlement or provide snapshot/history completeness |
| Migration module | Execute one eligible v2-to-v3 claim | Cannot move v2 liabilities or silently copy profile/primary/market state |
| Protocol owner | Bounded administration and pause | Cannot upgrade immutable bytecode or withdraw protected liabilities |
| Treasury | Receive verified surplus/fees | Has no ownership or resolver authority merely by being treasury |
| MCP | Read state and prepare unsigned plans | Never stores keys, signs or broadcasts |
| x402 facilitator | Verify/settle the advertised payment scheme | Cannot choose the registered label, owner or on-chain terms |
| Durable x402 store | Enforce global order/payment uniqueness and fenced leases | Cannot sign transactions or change contract state |
| Managed keeper signer | Broadcast allowlisted, fully bound commit/reveal calls within limits | Cannot make arbitrary calls, choose recipients or reuse an authorization |
| RPC/browser | Transport and display untrusted public state | Is not an availability, identity or payment authority |

## Canonicalization and attestation

Full ENSIP-15 validation includes large Unicode, emoji and confusable tables and is not inferred from a small UTF-8 validator. Client-only normalization would let a direct contract caller mint noncanonical or mixed-script bytes. V3 therefore uses both:

- exact-pinned `@adraffy/ens-normalize@1.11.1` with Unicode 17.0.0 and CLDR 47;
- profile identifier `ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47` and hash `0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638`;
- a shared valid/invalid conformance corpus;
- bounded on-chain UTF-8/display/length checks;
- an immutable EIP-712 normalization attestor.

An attestation binds chain ID, controller, registry normalization-profile hash, exact normalized label hash, recipient and `validUntil`; its EIP-712 domain is also controller/chain scoped. The reveal commitment binds the exact attestation hash. Invalid, expired, overly long-lived, wrong-chain, wrong-controller, wrong-profile, wrong-label and wrong-recipient contexts revert before payment. The attestation itself is not advertised as single-use; replay resistance comes from the fully scoped, single-use commitment and name lifecycle.

Residual trust is explicit: a compromised attestor can authorize a label that the published normalizer would reject; an unavailable or lost attestor key stops new public registrations. It cannot steal or mutate existing names. The attestor is not owner-rotatable; changing it requires a new reviewed controller/suite release and manifest cutover. Production operation therefore requires a separate managed/threshold key, monitoring, issuance logs without raw names where avoidable, rate limits and a documented replacement release procedure.

## Commit-reveal threats

| Threat | Required mitigation/evidence |
|---|---|
| Mempool name sniping | Label is hidden in a commitment until minimum age |
| Copied reveal | Commitment binds recipient, duration, resolver initialization, referrer, expected amount/BPS, attestation and secret |
| Cross-chain/controller replay | Chain ID and controller/suite identity are bound |
| Early/expired reveal | Immutable bounded minimum/maximum age; single-use consumption |
| Price/referral change | Exact expected guards are checked before collection/state mutation |
| Pause/insolvency after commit | Reveal fails closed; no payment collected; retry/expiry state remains explicit |
| Secret leakage | Secret never enters URL, analytics, MCP output, x402 payment payload or server logs |

## Resolver and identity threats

- Reverse text is only a candidate. It is trusted only when lifecycle, owner and forward address all confirm the account at one block snapshot.
- Resolver text and URLs are untrusted public content. Web rendering uses bounded text, HTTPS allowlisting where a link is created, escaping and no raw HTML.
- Transfer and market settlement clear or version-invalidate owner-bound address/text/reverse state before the new owner is presented as verified.
- Resolver interface discovery returns only implemented ERC-165 IDs. The public resolver's ENSIP-10 extended dispatch is tested with encoded DNS names and malformed-call rejection.
- The separate Universal Resolver helper is limited to supported ENSIP-23 simple resolve/reverse behavior. The first profile intentionally excludes contenthash, CCIP-Read and smart multicall and cannot be represented as full official ENS Universal Resolver parity.
- RPC disagreement/failure returns an unavailable/typed error state; it never falls back to an owner, address or empty profile that looks authoritative.

## Marketplace and accounting threats

Economic objects bind registry, marketplace, token ID, ownership nonce, settlement asset, exact amount, fee snapshot and expiry/deadline.

- Fixed buy rechecks ACTIVE lifecycle, seller ownership, listing nonce, price and fee before collection.
- Offers collect exact escrow at creation. Accept and cancel/expire are mutually exclusive; stale ownership preserves a buyer refund path.
- Auctions escrow the NFT, collect bids exactly, credit the previous highest bidder as a pull refund, bound anti-sniping extensions and finalize once.
- External payout does not occur in list/buy/offer/bid/finalize state transitions. Claim/refund reduces liability before the external call and fully reverts on payout failure.
- Standard native and six-decimal ERC-20 fixtures are tested. Sender and recipient balance deltas must both equal the requested amount, rejecting fee-on-transfer/rebasing behavior.
- `settlementBalance >= protectedLiability` is invariant. Treasury withdrawal transfers only verified surplus.
- Pausing blocks new exposure but not cancel, expiry cleanup, refund or existing claim paths.

## Migration threats

- Eligibility is tied to the declared v2 contract, source state/block and live owner/status policy or audited proof.
- Each source label/token can be claimed once and only by the eligible owner to an explicit recipient.
- V3 expiry never silently shortens the source right.
- Profile, text, resolution and primary state require explicit review; listings, referrals and proceeds are not copied.
- V2 remains immutable and its referral/seller liabilities remain claimable and excluded from v3 solvency accounting.

## Paid x402 threats

| Threat | Required control |
|---|---|
| Payment replay or duplicate HTTP retry | Global uniqueness for payment authorization, payment identifier, quote ID and request fingerprint |
| Two workers execute one order | Atomic reserve/CAS plus expiring fenced lease; stale fencing tokens rejected |
| Crash after commit/reveal broadcast | Persist transaction hash first; reconcile receipt/current state before any retry |
| Stale quote or name taken | Same-block revalidation and simulation before every value-bearing broadcast |
| Registered but facilitator settle fails | Never re-register; enter reconciliation-only state with operator alert/evidence |
| Settled but registration cannot complete | Prefer verify-before-registration and settle-after-confirmation; otherwise durable refund/manual-review liability and SLA |
| Keeper compromise | External managed signer, allowlisted targets/selectors, exact calldata/value, per-order/daily limits and separate low-balance identity |
| Secret/log leakage | Redact payment payloads, auth headers, quote HMAC keys, signer credentials and authenticated URLs |
| Wrong asset/decimals or invented testnet value | Require manifest/on-chain parity for `eip155:84532` Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals; keep test-ETH gas separate and publish no fiat valuation |

The route remains disabled and returns fail-closed readiness blockers until the v3 ABI, ERC-20 settlement, official x402 V2 adapter, facilitator, authenticated quote, durable store, managed signer, monitoring and end-to-end recovery tests are all present.

## Administration and operations

- Immutable bytecode is preferred; no proxy is in the v3 suite.
- Final owner/treasury/pause roles require a reviewed multisig and documented emergency procedure. A bootstrap EOA is not a production-ready owner.
- Registry wiring is performed once by the immutable `suiteConfigurator` through `configureSuite(controller,resolver,migration,marketplace)`, verified immediately and irreversibly locked. Universal Resolver→registry and MarketLens→marketplace→registry bindings are verified separately. This configurator is not the protocol owner and receives no continuing admin authority.
- Public browser RPC and authenticated server RPC are separate. Neither URL with credentials is published in manifests or logs.
- Monitoring covers solvency/liability deltas, admin events, commitments/reveals, auction finalization, refunds, x402 duplicate/order states, attestor failures and manifest/ABI drift.
- Incident pause stops new risk while claims/refunds/recovery remain available.

## Required security evidence

- Foundry unit, fuzz, invariant and adversarial callback suites;
- shared normalization fixtures plus invalid-attestation cases;
- static analysis and independent audit with finding closure;
- deployment bytecode/source verification and ABI checksums;
- Base Sepolia register/renew/resolve/text/fixed/offer/auction/migration receipts;
- paid x402 duplicate, crash, timeout, response-loss, settle-failure and reconciliation E2E;
- browser keyboard/mobile/error-state tests;
- multisig, alert and incident-drill evidence;
- acceptance rows and transaction records linked from the release bundle.

Passing tests reduce known risk; they do not make unaudited software risk-free.
