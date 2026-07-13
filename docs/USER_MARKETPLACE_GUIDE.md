# Marketplace, Referrals and Proceeds Guide

Status: v2 user guide plus clearly labelled v3 target behavior.
Current network: Base Sepolia; test assets have no guaranteed fiat value.

## What is live in v2

The live v2 contract supports:

- fixed-price listings in the deployment settlement asset;
- exact-price purchases guarded by `expectedPrice`;
- seller proceeds credited as a pull-payment balance;
- registration-only referral rewards credited as a separate pull-payment balance;
- manual claims to a contract-approved recipient;
- `%0` marketplace fee and `%10` registration referral reward in the current deployment snapshot.

V2 does **not** support offers, bids, auctions, ENS/Unicode registration, commit-reveal or paid x402 registration. Those are v3 targets, not live features.

## Listing a name in v2

1. Connect the wallet that owns an ACTIVE name.
2. Open `/me?tab=listings` and select the name, or open `/name/<label>` directly.
3. Choose **List for sale**.
4. Enter a decimal price in the displayed settlement asset.
5. Review listing price, current marketplace fee and seller proceeds.
6. The app reads the current fee and sends it as `expectedFeeBps`; a changed fee makes the transaction revert before listing state is written.
7. Confirm only after checking chain, contract, token/name, price and fee in the wallet.

Updating a listing replaces price, timestamp and fee snapshot without adding a duplicate listing. Cancelling remains available while the marketplace is paused. A normal transfer, lifecycle invalidation or completed sale removes the listing.

## Buying a fixed listing in v2

1. Open `/market`; only revalidated ACTIVE listings are displayed.
2. Open the name and review owner, seller, expiry, settlement asset, exact price and network fee.
3. The application must re-read listing, owner and ACTIVE state before confirmation.
4. Native settlement sends exact `value`; ERC-20 settlement may require a separate exact-amount approval transaction.
5. `buyListedName(tokenId, expectedPrice)` reverts before collection if the seller changed the price.
6. On success the NFT and resolution move to the buyer. The prior owner's profile and primary mapping are cleared.
7. The seller is not paid during the purchase call; proceeds become claimable.

If a transaction times out, do not retry blindly. Check the explorer, current owner and listing state first.

## Seller proceeds and referral rewards

These are different balances:

| Balance | Created by | Not created by |
|---|---|---|
| Referral rewards | Successful registration with a valid referrer | Renewal and marketplace sale |
| Seller proceeds | Successful fixed-price sale | Listing or offer creation |

V2 claims are pull payments. The connected wallet is the default recipient. The current repository source exposes checksum-validated alternate recipient inputs for referral and seller-proceeds claims, rejects invalid/zero/protocol recipients, and passes the selected address to the existing v2 claim methods. The current protected Preview contains this source and the behavior is unit-covered, but it is **not production or funded hosted-wallet evidence**: the production alias must be redeployed and final-origin wallet-smoked before the feature is described as available on the public hosted app.

An unavailable/RPC-error balance is not `0`. UI and integrations must show loading/unavailable separately and keep claim disabled until the value is verified.

## Referral flow in v2

1. Connect a wallet and open `/me?tab=referrals`.
2. Copy the `/r/<wallet-address>` link.
3. A valid visit creates a versioned, chain/contract-scoped, SameSite=Lax cookie for the configured attribution period.
4. Registration shows the referrer and current reward rate; the visitor can clear attribution before confirming.
5. Direct payer/recipient self-referral is removed/rejected. Indirect second-wallet abuse cannot be fully prevented without an identity system.
6. Successful registration credits the referrer's on-chain balance. The registrant receives no discount in the current SEPBASE model.
7. The referrer claims later from `/me?tab=referrals`.

This differs from Hood's published model: SEPBASE v2 does not pay marketplace referral rewards, does not discount the registrant/buyer and does not pay the reward directly during registration.

## V3 offers

V3 target behavior, not live:

1. Buyer creates an offer with amount, intended recipient and expiry.
2. Exact settlement funds are escrowed.
3. Buyer may cancel before acceptance; expired/stale offers become refundable.
4. Current owner accepts only while the ownership nonce and lifecycle match.
5. Seller proceeds and buyer refunds are pull balances; no external payout occurs during acceptance/cancel.

## V3 auctions

V3 target behavior, not live:

1. Seller chooses reserve, start/end and minimum increment.
2. NFT enters audited marketplace custody.
3. Every bid escrows exact funds; the prior highest bidder receives a claimable refund.
4. Seller can cancel only before the first valid bid.
5. Near-end bids may extend the auction only within the bounded anti-sniping policy.
6. Anyone may finalize after end. Reserve success transfers to the winner and credits seller proceeds; reserve failure returns the NFT and refunds bidders.

## V3 MarketLens discovery

V3 target behavior, not live:

- `ChainNameMarketLensV3` is a separate seventh address. It is a bounded read-only helper, not marketplace authority, custody, an indexer, or a historical-completeness service.
- `getListings(cursor,limit)`, `getOffers(tokenId,cursor,limit)` and `getAuctions(cursor,limit)` return records that remain active at the pinned block.
- `getGlobalOffers`, `getBuyerOffers` and `getOwnerOffers` support `includeTerminal`; terminal `REFUNDED` and `ACCEPTED` records remain queryable, while an `ACTIVE` offer whose lifecycle/owner/transfer nonce no longer matches is returned with `stale=true`.
- `limit` must be 1-50 and each call scans at most 100 raw entries. `nextCursor` is a raw enumerable index and advances even when records are filtered.
- Marketplace swap-pop cleanup can reorder later indices. Pin every page to one block, deduplicate by token/offer ID, and re-read registry/marketplace state before any write. A short page does not prove global exhaustion unless the authoritative raw cursor reached the current length.

The V3 deployment manifest must publish the lens address, version, ABI checksum, immutable marketplace binding and derived registry binding. A missing/mismatched lens disables lens-backed discovery but never changes marketplace ownership, escrow or liability truth.

## Runnable v2 read examples

Set real values from the generated manifest. These examples perform reads only.

```bash
SITE="http://localhost:3000"
curl -fsS "$SITE/api/market?cursor=0&limit=24"
curl -fsS "$SITE/api/name/alice?durationYears=1"
```

```ts
import { createSepbaseClient } from "@sepbase/sdk";

const client = await createSepbaseClient(
  process.env.SEPBASE_MANIFEST_URL!,
  {
    allowedManifestOrigins: [new URL(process.env.SEPBASE_MANIFEST_URL!).origin],
    allowedRpcOrigins: [new URL(process.env.SEPBASE_RPC_URL!).origin],
    rpcUrl: process.env.SEPBASE_RPC_URL,
  },
);

const market = await client.getActiveListings(0n, 24);
const settlement = await client.getSettlementAsset();
console.log({ market, settlement });
```

The SDK package is currently a workspace package, not a verified public npm install. Run this TypeScript example inside this monorepo until a public package release exists.

## Safe write preparation examples

The following is a plan fragment, not an execution receipt. Application fixtures must provide `publicClient`, `walletClient`, `account`, `manifest` and `abi`.

```ts
const listing = await publicClient.readContract({
  address: manifest.contract,
  abi,
  functionName: "listings",
  args: [tokenId],
});

const currentOwner = await publicClient.readContract({
  address: manifest.contract,
  abi,
  functionName: "ownerOf",
  args: [tokenId],
});

if (currentOwner.toLowerCase() !== listing.seller.toLowerCase()) {
  throw new Error("Stale listing");
}

const { request } = await publicClient.simulateContract({
  account,
  address: manifest.contract,
  abi,
  functionName: "buyListedName",
  args: [tokenId, listing.price],
  value: manifest.settlement.kind === "native" ? listing.price : undefined,
});

// Explicit user authority is required here:
const txHash = await walletClient.writeContract(request);
```

Do not call the last line in automated documentation smoke. Transaction evidence is recorded only after an authorized broadcast and confirmed receipt, using `docs/TRANSACTION_EVIDENCE.md`.

## Empty and failure states

- Empty market: local/source-ready UI now distinguishes `MARKET EMPTY` (“No verified active listings yet”) from filter-only `NO MATCHES` and links owners to `/me?tab=listings`. The currently hosted alias still shows the older empty treatment until redeploy/final-origin smoke, so this wording is not hosted-live evidence.
- Paused market: keep listings visible but disable list/buy; keep cancel/refund/claim available.
- Insolvent protocol: stop new economic exposure; show a critical health state; preserve recovery claims.
- Stale listing: remove it from purchasable results and offer permissionless cleanup where safe.
- RPC failure: never display an invented owner, zero balance or “not listed” as verified truth.
