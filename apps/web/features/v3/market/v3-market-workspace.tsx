"use client";

import {
  type SepbaseV3Client,
  type V3AccountBalances,
  type V3Auction,
  type V3Listing,
  type V3NameRecord,
  type V3Offer,
} from "@sepbase/sdk";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useConfiguredChainSwitch } from "@/components/wallet/use-configured-chain-switch";
import {
  getV3BrowserClient,
  v3BrowserManifest,
} from "@/lib/v3-browser-runtime";
import { createV3WagmiAdapter } from "@/lib/use-v3-plan-execution";
import { formatSettlementAmount } from "@/lib/settlement";
import { createV3MarketReader } from "./create-v3-market-reader";
import {
  buildV3MarketIntent,
  createV3MarketFormState,
  type V3MarketFormState,
} from "./v3-market-form";
import {
  assertV3MarketPageBlock,
  v3MarketPageHistory,
  v3MarketPageTarget,
} from "./v3-market-pagination";
import { V3MarketActionPanel } from "./v3-market-action-panel";
import { v3MarketWorkspaceScopeKey } from "./v3-market-account-scope";
import { useV3MarketExecutionLocked } from "./v3-market-execution-lock";
import {
  readV3MarketNameContexts,
  requireV3MarketNameContext,
  type V3MarketNameContextMap,
} from "./v3-market-name-context";
import {
  V3_MARKET_ACTION_COPY,
  type V3MarketActionKind,
  type V3ReleaseContext,
} from "./types";
import styles from "./v3-market-workspace.module.css";

type MarketSnapshot = {
  blockNumber: bigint;
  listings: V3Listing[];
  listingsCursor: bigint;
  listingsNextCursor: bigint;
  offers: V3Offer[];
  offersCursor: bigint;
  offersNextCursor: bigint;
  auctions: V3Auction[];
  auctionsCursor: bigint;
  auctionsNextCursor: bigint;
  ownedNames: V3NameRecord[];
  balances: V3AccountBalances | null;
  nameContexts: V3MarketNameContextMap;
};

type MarketPageKey = "listings" | "offers" | "auctions";
type PageHistory = Record<MarketPageKey, bigint[]>;

const emptyPageHistory: PageHistory = { listings: [], offers: [], auctions: [] };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: MarketSnapshot };

const release: V3ReleaseContext = {
  status: v3BrowserManifest.releaseStatus,
  suiteReleaseId: v3BrowserManifest.suiteReleaseId,
  chainId: v3BrowserManifest.chainId,
  requiredConfirmations: v3BrowserManifest.requiredConfirmations,
};

function sameAddress(left: string, right: string | undefined) {
  return Boolean(right && left.toLowerCase() === right.toLowerCase());
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function date(value: bigint) {
  if (value < 0n || value > 8_640_000_000_000n) return value.toString();
  return new Date(Number(value) * 1_000).toLocaleString();
}

function settlementAmount(value: bigint) {
  return `${formatSettlementAmount(value, v3BrowserManifest.settlement.decimals)} test ${v3BrowserManifest.settlement.symbol}`;
}

function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button type="button" className={styles.rowAction} onClick={onClick} disabled={disabled}>{children}</button>;
}

function PageControls({
  cursor,
  nextCursor,
  pageNumber,
  hasPrevious,
  busy,
  error,
  onPrevious,
  onNext,
}: {
  cursor: bigint;
  nextCursor: bigint;
  pageNumber: number;
  hasPrevious: boolean;
  busy: boolean;
  error: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className={styles.pagination} aria-label="Market page navigation">
      <button type="button" onClick={onPrevious} disabled={!hasPrevious || busy}>Previous</button>
      <span>PAGE {pageNumber}</span>
      <button type="button" onClick={onNext} disabled={nextCursor <= cursor || busy}>Next</button>
      {error ? <strong role="alert">Page read failed; the current pinned page was kept.</strong> : null}
    </nav>
  );
}

function visibleMarketTokenIds(input: {
  listings: readonly V3Listing[];
  offers: readonly V3Offer[];
  auctions: readonly V3Auction[];
}) {
  return [
    ...input.listings.map((item) => item.tokenId),
    ...input.offers.map((item) => item.tokenId),
    ...input.auctions.map((item) => item.tokenId),
  ];
}

export function V3MarketWorkspace() {
  const account = useAccount();
  const scopeKey = v3MarketWorkspaceScopeKey(account.address, account.chainId);
  return <V3MarketWorkspaceSession key={scopeKey} account={account} />;
}

function V3MarketWorkspaceSession({ account }: { account: ReturnType<typeof useAccount> }) {
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const chainSwitch = useConfiguredChainSwitch();
  const marketExecutionLocked = useV3MarketExecutionLocked();
  const formRef = useRef<HTMLElement>(null);
  const [client, setClient] = useState<SepbaseV3Client | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [form, setForm] = useState<V3MarketFormState>(() => createV3MarketFormState(account.address));
  const [pageHistory, setPageHistory] = useState<PageHistory>(emptyPageHistory);
  const [paging, setPaging] = useState<MarketPageKey | null>(null);
  const [pageError, setPageError] = useState<MarketPageKey | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeView, setActiveView] = useState<MarketPageKey>("listings");
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) setLoadState({ status: "loading" });
        return getV3BrowserClient();
      })
      .then(async (nextClient) => {
        const latestBlockNumber = await nextClient.publicClient.getBlockNumber();
        const confirmationDepth = BigInt(nextClient.manifest.requiredConfirmations - 1);
        if (latestBlockNumber < confirmationDepth) throw new Error("V3_MARKET_CONFIRMATION_FLOOR");
        const blockNumber = latestBlockNumber - confirmationDepth;
        const [listingsPage, offersPage, auctionsPage, ownedPage, balances] = await Promise.all([
          nextClient.getListings(0n, v3BrowserManifest.marketplace.maxPageSize, blockNumber),
          nextClient.getGlobalOffers(0n, v3BrowserManifest.marketplace.maxPageSize, true, blockNumber),
          nextClient.getAuctions(0n, v3BrowserManifest.marketplace.maxPageSize, blockNumber),
          account.address
            ? nextClient.getOwnedNames(account.address, 0n, v3BrowserManifest.marketplace.maxPageSize, blockNumber)
            : Promise.resolve({ items: [], total: 0n, nextCursor: 0n, blockNumber }),
          account.address
            ? nextClient.getAccountBalances(account.address, blockNumber)
            : Promise.resolve(null),
        ]);
        if (
          listingsPage.blockNumber !== blockNumber
          || offersPage.blockNumber !== blockNumber
          || auctionsPage.blockNumber !== blockNumber
          || ownedPage.blockNumber !== blockNumber
          || (balances && balances.blockNumber !== blockNumber)
        ) {
          throw new Error("V3_MARKET_BLOCK_MISMATCH");
        }
        const nameContexts = await readV3MarketNameContexts(
          nextClient,
          visibleMarketTokenIds({
            listings: listingsPage.items,
            offers: offersPage.items,
            auctions: auctionsPage.items,
          }),
          blockNumber,
          v3BrowserManifest.marketplace.maxPageSize * 3,
        );
        const snapshot: MarketSnapshot = {
          blockNumber,
          listings: listingsPage.items,
          listingsCursor: 0n,
          listingsNextCursor: listingsPage.nextCursor,
          offers: offersPage.items,
          offersCursor: 0n,
          offersNextCursor: offersPage.nextCursor,
          auctions: auctionsPage.items,
          auctionsCursor: 0n,
          auctionsNextCursor: auctionsPage.nextCursor,
          ownedNames: ownedPage.items,
          balances,
          nameContexts,
        };
        if (active) {
          setClient(nextClient);
          setLoadState({ status: "ready", snapshot });
          setPageHistory(emptyPageHistory);
          setPaging(null);
          setPageError(null);
        }
      })
      .catch(() => {
        if (active) {
          setClient(null);
          setLoadState({
            status: "error",
            message: "The verified V3 market reader could not produce a same-block snapshot. No empty or zero state was assumed.",
          });
        }
      });
    return () => { active = false; };
  }, [account.address, refreshSequence]);

  const reader = useMemo(() => client ? createV3MarketReader(client) : null, [client]);
  const execution = useMemo(() => {
    if (!client || !publicClient || !account.address || !account.chainId) return null;
    return {
      client,
      adapter: createV3WagmiAdapter({
        account: account.address,
        chainId: account.chainId,
        publicClient,
        sendTransaction: (request) => sendTransactionAsync(request as never),
      }),
    };
  }, [account.address, account.chainId, client, publicClient, sendTransactionAsync]);

  const intentResult = useMemo(() => {
    try {
      return {
        intent: buildV3MarketIntent(form, v3BrowserManifest.settlement.decimals),
        error: null,
      };
    } catch (error) {
      return {
        intent: null,
        error: error instanceof Error ? error.message : "Review the action fields.",
      };
    }
  }, [form]);

  const selectAction = useCallback((action: V3MarketActionKind, values: Partial<V3MarketFormState> = {}) => {
    if (marketExecutionLocked) return;
    setForm((current) => ({
      ...current,
      action,
      recipient: current.recipient || account.address || "",
      ...values,
    }));
    setManageOpen(false);
    setComposerOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [account.address, marketExecutionLocked]);

  const needsPrice = form.action === "fixed-list"
    || form.action === "fixed-update"
    || form.action === "auction-create";
  const needsAmount = form.action === "offer-create" || form.action === "auction-bid";
  const needsDeadline = form.action === "fixed-list"
    || form.action === "fixed-update"
    || form.action === "offer-create";
  const needsRecipient = form.action === "fixed-buy"
    || form.action === "offer-create"
    || form.action === "auction-bid"
    || form.action === "claim";

  const snapshot = loadState.status === "ready" ? loadState.snapshot : null;

  const loadPage = useCallback(async (key: MarketPageKey, direction: "next" | "previous") => {
    if (!client || loadState.status !== "ready" || paging || marketExecutionLocked) return;
    const current = loadState.snapshot;
    const cursor = current[`${key}Cursor`];
    const nextCursor = current[`${key}NextCursor`];
    const target = v3MarketPageTarget({ direction, cursor, nextCursor, history: pageHistory[key] });
    if (target === null) return;

    setPaging(key);
    setPageError(null);
    try {
      const page = key === "listings"
        ? await client.getListings(target, v3BrowserManifest.marketplace.maxPageSize, current.blockNumber)
        : key === "offers"
          ? await client.getGlobalOffers(target, v3BrowserManifest.marketplace.maxPageSize, true, current.blockNumber)
          : await client.getAuctions(target, v3BrowserManifest.marketplace.maxPageSize, current.blockNumber);
      assertV3MarketPageBlock(page.blockNumber, current.blockNumber);
      const nextListings = key === "listings" ? page.items as V3Listing[] : current.listings;
      const nextOffers = key === "offers" ? page.items as V3Offer[] : current.offers;
      const nextAuctions = key === "auctions" ? page.items as V3Auction[] : current.auctions;
      const nameContexts = await readV3MarketNameContexts(
        client,
        visibleMarketTokenIds({ listings: nextListings, offers: nextOffers, auctions: nextAuctions }),
        current.blockNumber,
        v3BrowserManifest.marketplace.maxPageSize * 3,
      );
      setLoadState((existing) => {
        if (existing.status !== "ready" || existing.snapshot.blockNumber !== current.blockNumber) return existing;
        if (key === "listings") {
          return { status: "ready", snapshot: { ...existing.snapshot, listings: nextListings, listingsCursor: target, listingsNextCursor: page.nextCursor, nameContexts } };
        }
        if (key === "offers") {
          return { status: "ready", snapshot: { ...existing.snapshot, offers: nextOffers, offersCursor: target, offersNextCursor: page.nextCursor, nameContexts } };
        }
        return { status: "ready", snapshot: { ...existing.snapshot, auctions: nextAuctions, auctionsCursor: target, auctionsNextCursor: page.nextCursor, nameContexts } };
      });
      setPageHistory((existing) => ({
        ...existing,
        [key]: v3MarketPageHistory({ direction, cursor, history: existing[key] }),
      }));
    } catch {
      setPageError(key);
    } finally {
      setPaging(null);
    }
  }, [client, loadState, marketExecutionLocked, pageHistory, paging]);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.kicker}>MARKET / {v3BrowserManifest.chainName.toUpperCase()}</div>
          <div className={styles.titleRow}>
            <h1>NAME<br /><span>MARKET</span></h1>
            <div>
              <p>Buy a listed name, make an offer, or join an auction.</p>
              <small>Prices use test {v3BrowserManifest.settlement.symbol}. Network fees use Base Sepolia ETH.</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.market}>
        <div className={styles.inner}>
          <div className={styles.toolbar} aria-label="Market browsing controls">
            <div className={styles.viewTabs} role="tablist" aria-label="Market sections">
              <button type="button" role="tab" aria-selected={activeView === "listings"} onClick={() => setActiveView("listings")}>
                For sale <span>{snapshot?.listings.length ?? "-"}</span>
              </button>
              <button type="button" role="tab" aria-selected={activeView === "offers"} onClick={() => setActiveView("offers")}>
                Offers <span>{snapshot?.offers.length ?? "-"}</span>
              </button>
              <button type="button" role="tab" aria-selected={activeView === "auctions"} onClick={() => setActiveView("auctions")}>
                Auctions <span>{snapshot?.auctions.length ?? "-"}</span>
              </button>
            </div>
            <div className={styles.toolbarActions}>
              {!account.address ? <span>Browse without connecting</span> : account.chainId !== v3BrowserManifest.chainId ? (
                <button type="button" onClick={() => void chainSwitch.switchToConfiguredChain()} disabled={chainSwitch.isSwitching || marketExecutionLocked}>
                  {chainSwitch.isSwitching ? "Switching..." : `Switch to ${v3BrowserManifest.chainName}`}
                </button>
              ) : (
                <button type="button" onClick={() => setManageOpen((value) => !value)} disabled={marketExecutionLocked}>
                  {manageOpen ? "Close selling tools" : "Sell a name"}
                </button>
              )}
              <button type="button" onClick={() => setRefreshSequence((value) => value + 1)} disabled={paging !== null || marketExecutionLocked}>
                Refresh
              </button>
            </div>
          </div>

          {loadState.status === "loading" ? (
            <div className={styles.state} role="status"><span>MARKET</span><h2>Loading verified market activity...</h2></div>
          ) : null}
          {loadState.status === "error" ? (
            <div className={styles.state} role="alert" data-error="true">
              <span>MARKET UNAVAILABLE</span>
              <h2>We couldn&apos;t load the market.</h2>
              <p>No listing or balance was assumed to be zero.</p>
              <button type="button" onClick={() => setRefreshSequence((value) => value + 1)} disabled={marketExecutionLocked}>Try again</button>
            </div>
          ) : null}

          {snapshot && activeView === "listings" ? (
            <section className={styles.section} aria-labelledby="v3-listings-heading">
              <div className={styles.viewHeading}>
                <div><span>FOR SALE</span><h2 id="v3-listings-heading">Available names</h2></div>
                <p>Buy at the listed price or make an offer.</p>
              </div>
              {snapshot.listings.length === 0 ? (
                <div className={styles.empty}><span>MARKET EMPTY</span><h3>No names are listed yet.</h3><p>Connected owners can list a name from “Sell a name”.</p></div>
              ) : (
                <div className={styles.table}>
                  <div className={styles.tableHeader} aria-hidden="true"><span>NO.</span><span>NAME</span><span>SELLER</span><span>AVAILABLE UNTIL</span><span>PRICE</span><span>ACTION</span></div>
                  {snapshot.listings.map((listing, index) => {
                    const name = requireV3MarketNameContext(snapshot.nameContexts, listing.tokenId);
                    return (
                      <article className={styles.listingRow} key={listing.tokenId.toString()}>
                        <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                        <Link className={styles.nameLink} href={`/name/${encodeURIComponent(name.label)}`}>{name.fullName}</Link>
                        <span title={listing.seller}>{shortAddress(listing.seller)}</span>
                        <time>{date(listing.deadline)}</time>
                        <strong>{settlementAmount(listing.price)}</strong>
                        <div className={styles.rowActions}>
                          {sameAddress(listing.seller, account.address) ? (
                            <>
                              <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-update", { tokenId: listing.tokenId.toString(), price: formatUnits(listing.price, v3BrowserManifest.settlement.decimals) })}>Update</ActionButton>
                              <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-cancel", { tokenId: listing.tokenId.toString() })}>Cancel</ActionButton>
                            </>
                          ) : (
                            <>
                              <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-buy", { tokenId: listing.tokenId.toString() })}>Buy</ActionButton>
                              <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-create", { tokenId: listing.tokenId.toString() })}>Offer</ActionButton>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <PageControls cursor={snapshot.listingsCursor} nextCursor={snapshot.listingsNextCursor} pageNumber={pageHistory.listings.length + 1} hasPrevious={pageHistory.listings.length > 0} busy={paging !== null || marketExecutionLocked} error={pageError === "listings"} onPrevious={() => void loadPage("listings", "previous")} onNext={() => void loadPage("listings", "next")} />
            </section>
          ) : null}

          {snapshot && activeView === "offers" ? (
            <section className={styles.section} aria-labelledby="v3-offers-heading">
              <div className={styles.viewHeading}>
                <div><span>OFFERS</span><h2 id="v3-offers-heading">Name offers</h2></div>
                <p>Open offers and their current status.</p>
              </div>
              {snapshot.offers.length === 0 ? (
                <div className={styles.empty}><span>NO OFFERS</span><h3>No open offers yet.</h3><p>Offers made from a listed name will appear here.</p></div>
              ) : (
                <div className={styles.table}>
                  <div className={styles.tableHeader} aria-hidden="true"><span>NO.</span><span>NAME</span><span>BUYER</span><span>STATUS</span><span>AMOUNT</span><span>ACTION</span></div>
                  {snapshot.offers.map((offer, index) => {
                    const name = requireV3MarketNameContext(snapshot.nameContexts, offer.tokenId);
                    return (
                      <article className={styles.listingRow} key={offer.offerId}>
                        <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                        <Link className={styles.nameLink} href={`/name/${encodeURIComponent(name.label)}`}>{name.fullName}</Link>
                        <span>{shortAddress(offer.buyer)}</span>
                        <span>{offer.stale ? "Outdated" : offer.state === "active" ? "Open" : offer.state}</span>
                        <strong>{settlementAmount(offer.amount)}</strong>
                        <div className={styles.rowActions}>
                          {offer.state === "active" && sameAddress(offer.ownerSnapshot, account.address) && !offer.stale ? <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-accept", { offerId: offer.offerId })}>Accept</ActionButton> : null}
                          {offer.state === "active" && sameAddress(offer.buyer, account.address) ? <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-cancel", { offerId: offer.offerId })}>Cancel</ActionButton> : null}
                          {offer.state === "active" && offer.stale ? <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-invalidate", { offerId: offer.offerId })}>Clear</ActionButton> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <PageControls cursor={snapshot.offersCursor} nextCursor={snapshot.offersNextCursor} pageNumber={pageHistory.offers.length + 1} hasPrevious={pageHistory.offers.length > 0} busy={paging !== null || marketExecutionLocked} error={pageError === "offers"} onPrevious={() => void loadPage("offers", "previous")} onNext={() => void loadPage("offers", "next")} />
            </section>
          ) : null}

          {snapshot && activeView === "auctions" ? (
            <section className={styles.section} aria-labelledby="v3-auctions-heading">
              <div className={styles.viewHeading}>
                <div><span>AUCTIONS</span><h2 id="v3-auctions-heading">Live auctions</h2></div>
                <p>Place a bid before the auction ends.</p>
              </div>
              {snapshot.auctions.length === 0 ? (
                <div className={styles.empty}><span>NO AUCTIONS</span><h3>No live auctions yet.</h3><p>Connected owners can start one from “Sell a name”.</p></div>
              ) : (
                <div className={styles.table}>
                  <div className={styles.tableHeader} aria-hidden="true"><span>NO.</span><span>NAME</span><span>RESERVE</span><span>HIGHEST BID</span><span>ENDS</span><span>ACTION</span></div>
                  {snapshot.auctions.map((auction, index) => {
                    const name = requireV3MarketNameContext(snapshot.nameContexts, auction.tokenId);
                    return (
                      <article className={styles.listingRow} key={auction.tokenId.toString()}>
                        <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                        <Link className={styles.nameLink} href={`/name/${encodeURIComponent(name.label)}`}>{name.fullName}</Link>
                        <strong>{settlementAmount(auction.reservePrice)}</strong>
                        <strong>{settlementAmount(auction.highestBid)}</strong>
                        <time>{date(auction.endAt)}</time>
                        <div className={styles.rowActions}>
                          <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-bid", { tokenId: auction.tokenId.toString() })}>Bid</ActionButton>
                          {sameAddress(auction.seller, account.address) && auction.highestBid === 0n ? <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-cancel", { tokenId: auction.tokenId.toString() })}>Cancel</ActionButton> : null}
                          <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-finalize", { tokenId: auction.tokenId.toString() })}>Complete</ActionButton>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <PageControls cursor={snapshot.auctionsCursor} nextCursor={snapshot.auctionsNextCursor} pageNumber={pageHistory.auctions.length + 1} hasPrevious={pageHistory.auctions.length > 0} busy={paging !== null || marketExecutionLocked} error={pageError === "auctions"} onPrevious={() => void loadPage("auctions", "previous")} onNext={() => void loadPage("auctions", "next")} />
            </section>
          ) : null}

          {snapshot && manageOpen && account.address ? (
            <section className={styles.managePanel} aria-labelledby="v3-owner-heading">
              <div className={styles.manageHeading}>
                <div><span>SELL A NAME</span><h2 id="v3-owner-heading">Your names</h2></div>
                <Link href="/me?tab=listings">Open balances</Link>
              </div>
              {snapshot.ownedNames.length === 0 ? (
                <div className={styles.empty}><span>NO NAMES</span><h3>This wallet has no active names.</h3></div>
              ) : (
                <div className={styles.ownedNames}>
                  {snapshot.ownedNames.map((name) => (
                    <article key={name.tokenId.toString()}>
                      <strong>{name.fullName}</strong>
                      <div className={styles.rowActions}>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("marketplace-approve", { tokenId: name.tokenId.toString() })}>Enable selling</ActionButton>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-list", { tokenId: name.tokenId.toString() })}>Set price</ActionButton>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-create", { tokenId: name.tokenId.toString() })}>Start auction</ActionButton>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {composerOpen ? (
            <section className={styles.composer} ref={formRef} aria-labelledby="v3-action-heading" aria-busy={marketExecutionLocked}>
              <div className={styles.composerHeading}>
                <div>
                  <span>{V3_MARKET_ACTION_COPY[form.action].group}</span>
                  <h2 id="v3-action-heading">{V3_MARKET_ACTION_COPY[form.action].title}</h2>
                  <p>Price and ownership are checked again before your wallet opens.</p>
                </div>
                <button type="button" onClick={() => setComposerOpen(false)} disabled={marketExecutionLocked}>Close</button>
              </div>
              <div className={styles.formGrid}>
                {needsPrice ? <Field label={form.action === "auction-create" ? "Reserve price" : "Price"} value={form.price} onChange={(price) => setForm((current) => ({ ...current, price }))} inputMode="decimal" suffix={`test ${v3BrowserManifest.settlement.symbol}`} disabled={marketExecutionLocked} /> : null}
                {needsAmount ? <Field label={form.action === "auction-bid" ? "Bid amount" : "Offer amount"} value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} inputMode="decimal" suffix={`test ${v3BrowserManifest.settlement.symbol}`} disabled={marketExecutionLocked} /> : null}
                {needsDeadline ? <Field label="Available until" type="datetime-local" value={form.deadline} onChange={(deadline) => setForm((current) => ({ ...current, deadline }))} disabled={marketExecutionLocked} /> : null}
                {form.action === "auction-create" ? (
                  <>
                    <Field label="Auction starts" type="datetime-local" value={form.startAt} onChange={(startAt) => setForm((current) => ({ ...current, startAt }))} disabled={marketExecutionLocked} />
                    <Field label="Auction ends" type="datetime-local" value={form.endAt} onChange={(endAt) => setForm((current) => ({ ...current, endAt }))} disabled={marketExecutionLocked} />
                  </>
                ) : null}
                {needsRecipient ? <Field label="Receive at" value={form.recipient} onChange={(recipient) => setForm((current) => ({ ...current, recipient }))} disabled={marketExecutionLocked} /> : null}
              </div>
              <div className={styles.formSummary}>
                <strong>{marketExecutionLocked ? "A wallet action is in progress." : intentResult.error ?? "Ready for final review."}</strong>
                {form.action === "marketplace-approve" ? <p>This enables selling only for the selected name.</p> : null}
              </div>
            </section>
          ) : null}

          {!composerOpen ? null : !account.address ? (
            <div className={styles.state}><span>WALLET</span><h2>Connect your wallet to continue.</h2><WalletButton /></div>
          ) : account.chainId !== v3BrowserManifest.chainId ? (
            <div className={styles.state}><span>NETWORK</span><h2>Switch to {v3BrowserManifest.chainName} to continue.</h2></div>
          ) : intentResult.intent && reader && execution ? (
            <V3MarketActionPanel release={release} account={account.address as Address} intent={intentResult.intent} reader={reader} execution={execution} />
          ) : (
            <div className={styles.state} role={intentResult.error ? "alert" : "status"}><span>{intentResult.error ? "CHECK THE FORM" : "PREPARING"}</span><h2>{intentResult.error ?? "Preparing your wallet."}</h2></div>
          )}
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  suffix,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className={styles.inputWithSuffix}>
        <input type={type} inputMode={inputMode} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}
