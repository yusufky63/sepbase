"use client";

import { ArrowUpDown, ExternalLink, Search, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { WalletButton } from "@/components/wallet/wallet-button";
import { projectConfig } from "@/config/project.config";
import { useSettlementApproval } from "@/features/transactions/settlement-approval";
import { TransactionComplete } from "@/features/transactions/transaction-complete";
import { TransactionStatus } from "@/features/transactions/transaction-status";
import txStyles from "@/features/transactions/transactions.module.css";
import { useMarketListings, useProtocolHealth, useProtocolTransaction, useVerifiedListing } from "@/lib/contract/hooks";
import type { MarketNameListing } from "@/lib/contract/types";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { protocolErrorMessage } from "@/lib/errors";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { formatBps } from "@/lib/settlement";
import { queueTransactionNotice } from "@/lib/transaction-notice";
import styles from "./market-workspace.module.css";

type Sort = "newest" | "price-low" | "price-high" | "name" | "length" | "expiry";

function labelFromFullName(fullName: string) {
  const suffix = `.${projectConfig.brand.suffix}`;
  return fullName.endsWith(suffix) ? fullName.slice(0, -suffix.length) : fullName;
}

function BuyDialog({ listing, open, onClose }: { listing: MarketNameListing | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { address } = useAccount();
  const transaction = useProtocolTransaction();
  const verified = useVerifiedListing(listing?.tokenId, open);
  const currentListing = verified.listing;
  const approval = useSettlementApproval(currentListing?.price ?? 0n, "buy");
  const health = useProtocolHealth();
  const isSeller = Boolean(currentListing && address?.toLowerCase() === currentListing.seller.toLowerCase());
  const priceChanged = Boolean(listing && currentListing && listing.price !== currentListing.price);
  const marketWritable = health.solvent === true && health.marketplacePaused === false && !health.isError;
  const refetchVerifiedListing = verified.refetch;

  useEffect(() => {
    if (!open || !listing) return;
    void refetchVerifiedListing();
  }, [listing, open, refetchVerifiedListing]);

  async function buy() {
    if (!currentListing || verified.isFetching || !marketWritable) return;
    await transaction.send({
      functionName: "buyListedName",
      args: [currentListing.tokenId, currentListing.price],
      value: deploymentManifest.settlement.kind === "native" ? currentListing.price : undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      critical
      title={listing ? `Buy ${listing.fullName}` : "Buy name"}
      description="Review the name and current price before confirming in your wallet."
    >
      {listing && transaction.isSuccess ? (
        <TransactionComplete
          hash={transaction.hash}
          title="Purchase complete"
          message={`${listing.fullName} is now owned by your connected wallet.`}
          primaryLabel="Open my names"
          onPrimary={() => {
            queueTransactionNotice("purchased", listing.fullName);
            onClose();
            router.push("/me?tab=names");
          }}
          secondaryLabel="Close"
          onSecondary={onClose}
        />
      ) : listing ? (
        <div className={txStyles.form}>
          {verified.isLoading || verified.isFetching ? (
            <div className={txStyles.notice} role="status">Re-checking the listing, seller, lifecycle, and exact price onchain...</div>
          ) : verified.error ? (
            <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">The current listing could not be verified. No purchase can be submitted.</div>
          ) : verified.isStale || !currentListing ? (
            <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">This listing is no longer active or its seller no longer owns the name.</div>
          ) : (
            <div className={txStyles.summary}>
              <div><span>Name</span><strong>{currentListing.fullName}</strong></div>
              <div><span>Seller</span><strong>{shortenAddress(currentListing.seller, 6)}</strong></div>
              <div><span>Status</span><strong>ACTIVE / VERIFIED</strong></div>
              <div><span>Price</span><strong><SettlementAmount amountBaseUnits={currentListing.price} /></strong></div>
              <div><span>Network fee</span><strong>{projectConfig.chain.nativeCurrency.symbol} / wallet estimate</strong></div>
            </div>
          )}
          {priceChanged ? <p className={txStyles.warning} role="status">The listing price changed after the market row loaded. Review the new verified price before confirming.</p> : null}
          <p className={txStyles.warning}>The NFT transfers to the buyer and the seller&apos;s profile, resolution, and primary mapping are reset.</p>
          <TransactionStatus transaction={transaction} />
          {health.isError ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">Marketplace health could not be verified. Purchases are disabled.</div> : null}
          {approval.sufficientBalance === false ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">The connected wallet does not have enough settlement-token balance.</div> : null}
          {approval.error ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">{protocolErrorMessage(approval.error)}</div> : null}
          <div className={txStyles.actions}>
            <Button variant="quiet" onClick={onClose}>Cancel</Button>
            {!address ? (
              <WalletButton />
            ) : !approval.ready ? (
              <Button disabled>{approval.error ? "Payment unavailable" : "Checking allowance..."}</Button>
            ) : approval.required ? (
              <Button onClick={() => void approval.approve()} disabled={approval.isPending || approval.isConfirming || approval.sufficientBalance !== true || !currentListing || verified.isFetching || !marketWritable || isSeller}>
                {approval.isPending || approval.isConfirming ? "Approving..." : "Approve payment"}
              </Button>
            ) : (
              <Button icon={<ShoppingBag size={17} />} onClick={() => void buy()} disabled={transaction.isPending || transaction.isConfirming || !currentListing || verified.isFetching || !marketWritable || approval.sufficientBalance !== true || isSeller}>
                Confirm purchase
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function MarketWorkspace() {
  const { address } = useAccount();
  const [offset, setOffset] = useState(0);
  const pageSize = projectConfig.marketplace.listingsPerPage;
  const market = useMarketListings(offset);
  const health = useProtocolHealth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<MarketNameListing | null>(null);
  const marketWritable = health.solvent === true && health.marketplacePaused === false && !health.isError;

  const listings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = market.listings.filter((listing) => listing.fullName.includes(needle));
    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.price < b.price ? -1 : a.price > b.price ? 1 : 0;
      if (sort === "price-high") return a.price > b.price ? -1 : a.price < b.price ? 1 : 0;
      if (sort === "name") return a.fullName.localeCompare(b.fullName);
      if (sort === "length") return a.fullName.length - b.fullName.length;
      if (sort === "expiry") return a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0;
      return a.listedAt > b.listedAt ? -1 : a.listedAt < b.listedAt ? 1 : 0;
    });
  }, [market.listings, query, sort]);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.kicker}>FIXED PRICE / {projectConfig.chain.name.toUpperCase()}</div>
          <div className={styles.titleRow}>
            <h1>NAME<br /><span>MARKET</span></h1>
            <p>Current .{projectConfig.brand.suffix} names offered at fixed prices.</p>
          </div>
          <div className={styles.metrics}>
            <div><span>LISTINGS</span><strong>{protocolDeployed && !market.error ? market.listings.length : "-"}</strong></div>
            <div><span>TOTAL LISTINGS</span><strong>{protocolDeployed ? market.total?.toString() ?? "Unavailable" : "-"}</strong></div>
            <div><span>SETTLEMENT</span><strong>{deploymentManifest.settlement.symbol}</strong></div>
            <div><span>MARKET FEE</span><strong>{health.marketplaceFeeBps === null ? "Unavailable" : formatBps(health.marketplaceFeeBps)}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.market}>
        <div className={styles.inner}>
          <div className={styles.toolbar}>
            <label>
              <Search size={18} aria-hidden="true" />
              <span className="srOnly">Filter market names</span>
              <input value={query} onChange={(event) => setQuery(event.target.value.toLowerCase())} placeholder={`Filter .${projectConfig.brand.suffix}`} />
            </label>
            <label>
              <ArrowUpDown size={18} aria-hidden="true" />
              <span className="srOnly">Sort listings</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="newest">Newest listed</option>
                <option value="price-low">Price: low first</option>
                <option value="price-high">Price: high first</option>
                <option value="name">Name: A-Z</option>
                <option value="length">Label: shortest first</option>
                <option value="expiry">Expiration: soonest</option>
              </select>
            </label>
          </div>

          {!protocolDeployed ? (
            <div className={styles.emptyState}><span>COMING SOON</span><h2>The market is not available on {projectConfig.chain.name} yet.</h2><p>Listings will appear here after launch.</p></div>
          ) : health.isError ? (
            <div className={styles.error} role="alert">Marketplace health could not be verified. Listings remain read-only and purchases are disabled.</div>
          ) : !health.isLoading && health.marketplacePaused === true ? (
            <div className={styles.notice}>Marketplace purchases and new listings are currently paused. Owners can still cancel existing listings.</div>
          ) : null}

          {protocolDeployed && market.isLoading ? <p className={styles.loading}>Loading listings...</p> : null}
          {protocolDeployed && market.error ? <p className={styles.error}>Listings could not be loaded. Try again.</p> : null}
          {protocolDeployed && !market.isLoading && !market.error && listings.length === 0 ? (
            market.listings.length === 0 && query.trim().length === 0 ? (
              <div className={styles.emptyState}>
                <span>MARKET EMPTY</span>
                <h2>No verified active listings yet.</h2>
                <p>
                  Own a name? <Link href="/me?tab=listings">List it from your account.</Link>
                </p>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>NO MATCHES</span>
                <h2>No active listings match this view.</h2>
                <p>Clear or change the filter to see other verified listings.</p>
              </div>
            )
          ) : null}

          {listings.length > 0 ? (
            <div className={styles.listings}>
              <div className={styles.tableHeader} aria-hidden="true">
                <span>INDEX</span><span>NAME</span><span>SELLER</span><span>EXPIRES</span><span>PRICE</span><span>ACTION</span>
              </div>
              {listings.map((listing, index) => {
                const isSeller = address?.toLowerCase() === listing.seller.toLowerCase();
                const label = labelFromFullName(listing.fullName);
                return (
                  <article className={styles.listing} key={listing.tokenId.toString()}>
                    <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                    <Link href={`/name/${encodeURIComponent(label)}`} className={styles.name}>{listing.fullName}<ExternalLink size={14} aria-hidden="true" /></Link>
                    <span className={styles.seller} title={listing.seller}>{shortenAddress(listing.seller)}</span>
                    <span>{formatDate(listing.expiresAt)}</span>
                    <strong><SettlementAmount amountBaseUnits={listing.price} /></strong>
                    {isSeller ? (
                      <Link className={styles.manageLink} href={`/name/${encodeURIComponent(label)}`}>Manage</Link>
                    ) : (
                      <Button
                        icon={<ShoppingBag size={16} />}
                        disabled={!marketWritable}
                        onClick={() => setSelected(listing)}
                      >
                        Buy
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
          {protocolDeployed && market.total !== null && market.total > BigInt(pageSize) ? (
            <div className={styles.pagination}>
              <Button variant="quiet" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</Button>
              <span>{offset + 1}-{Math.min(offset + pageSize, Number(market.total))} / {market.total.toString()}</span>
              <Button variant="quiet" disabled={BigInt(offset + pageSize) >= market.total} onClick={() => setOffset(offset + pageSize)}>Next</Button>
            </div>
          ) : null}
        </div>
      </section>

      <BuyDialog
        key={selected?.tokenId.toString() ?? "closed"}
        listing={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
