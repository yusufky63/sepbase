"use client";

import {
  type SepbaseV3Client,
  type V3AccountBalances,
  type V3Auction,
  type V3Listing,
  type V3NameRecord,
  type V3Offer,
} from "@sepbase/sdk";
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
  type V3ClaimKind,
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
  return `${formatUnits(value, v3BrowserManifest.settlement.decimals)} ${v3BrowserManifest.settlement.symbol}`;
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
  hasPrevious,
  busy,
  error,
  onPrevious,
  onNext,
}: {
  cursor: bigint;
  nextCursor: bigint;
  hasPrevious: boolean;
  busy: boolean;
  error: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className={styles.pagination} aria-label="Pinned market page navigation">
      <button type="button" onClick={onPrevious} disabled={!hasPrevious || busy}>Previous</button>
      <span>CURSOR {cursor.toString()} / PINNED PAGE</span>
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
  const formRef = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<SepbaseV3Client | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [form, setForm] = useState<V3MarketFormState>(() => createV3MarketFormState(account.address));
  const [pageHistory, setPageHistory] = useState<PageHistory>(emptyPageHistory);
  const [paging, setPaging] = useState<MarketPageKey | null>(null);
  const [pageError, setPageError] = useState<MarketPageKey | null>(null);

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
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [account.address, marketExecutionLocked]);

  const needsToken = form.action === "marketplace-approve"
    || form.action.startsWith("fixed-")
    || form.action === "offer-create"
    || form.action.startsWith("auction-");
  const needsOffer = form.action === "offer-cancel"
    || form.action === "offer-accept"
    || form.action === "offer-invalidate";
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
    <main className={styles.workspace}>
      <section className={styles.hero}>
        <div className={styles.kicker}>V3 MARKET / {v3BrowserManifest.chainName.toUpperCase()}</div>
        <div className={styles.heroGrid}>
          <h1>FIXED.<br />OFFERS.<br /><span>AUCTIONS.</span></h1>
          <div className={styles.heroCopy}>
            <p>One verified suite, three guarded settlement modes, and pull-payment claims.</p>
            <dl>
              <div><dt>SUITE</dt><dd><code>{v3BrowserManifest.suiteReleaseId}</code></dd></div>
              <div><dt>SETTLEMENT</dt><dd>{v3BrowserManifest.settlement.symbol} / {v3BrowserManifest.settlement.decimals} DECIMALS</dd></div>
              <div><dt>CONFIRMATIONS</dt><dd>{v3BrowserManifest.requiredConfirmations}</dd></div>
            </dl>
          </div>
        </div>
        <div className={styles.metrics}>
          <div><span>CONFIRMED BLOCK</span><strong>{snapshot?.blockNumber.toString() ?? "—"}</strong></div>
          <div><span>LISTINGS</span><strong>{snapshot?.listings.length ?? "—"}</strong></div>
          <div><span>OFFERS</span><strong>{snapshot?.offers.length ?? "—"}</strong></div>
          <div><span>AUCTIONS</span><strong>{snapshot?.auctions.length ?? "—"}</strong></div>
        </div>
      </section>

      <section className={styles.connection} aria-label="Wallet and market reader status">
        <div>
          <span>EXTERNAL WALLET</span>
          <strong>{account.address ? shortAddress(account.address) : "READ-ONLY"}</strong>
        </div>
        <div>
          <span>NETWORK</span>
          <strong>{account.chainId ? `EIP155:${account.chainId}` : "NOT CONNECTED"}</strong>
        </div>
        <div className={styles.connectionAction}>
          {!account.address ? (
            <WalletButton />
          ) : account.chainId !== v3BrowserManifest.chainId ? (
            <button
              type="button"
              onClick={() => void chainSwitch.switchToConfiguredChain()}
              disabled={chainSwitch.isSwitching || marketExecutionLocked}
            >
              {chainSwitch.isSwitching ? "Switching…" : `Switch to ${v3BrowserManifest.chainName}`}
            </button>
          ) : (
            <button type="button" onClick={() => setRefreshSequence((value) => value + 1)} disabled={paging !== null || marketExecutionLocked}>
              Refresh same-block view
            </button>
          )}
        </div>
      </section>

      {loadState.status === "loading" ? (
        <section className={styles.state} role="status">
          <span>VERIFIED READ IN PROGRESS</span>
          <h2>Pinning the market to one confirmed block.</h2>
        </section>
      ) : null}
      {loadState.status === "error" ? (
        <section className={styles.state} role="alert" data-error="true">
          <span>MARKET STATE UNAVAILABLE</span>
          <h2>No market assumption was made.</h2>
          <p>{loadState.message}</p>
          <button type="button" onClick={() => setRefreshSequence((value) => value + 1)} disabled={marketExecutionLocked}>Retry verified read</button>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.section} aria-labelledby="v3-listings-heading">
            <header><span>01 / FIXED</span><h2 id="v3-listings-heading">ACTIVE LISTINGS</h2></header>
            {snapshot.listings.length === 0 ? (
              <div className={styles.empty}><strong>ZERO VERIFIED LISTINGS</strong><p>This is a real empty result at block {snapshot.blockNumber.toString()}.</p></div>
            ) : (
              <div className={styles.rows}>
                {snapshot.listings.map((listing) => {
                  const name = requireV3MarketNameContext(snapshot.nameContexts, listing.tokenId);
                  return (
                  <article className={styles.row} key={listing.tokenId.toString()}>
                    <div><span>NAME</span><strong>{name.fullName}</strong><code>TOKEN {listing.tokenId.toString()}</code></div>
                    <div><span>SELLER</span><code title={listing.seller}>{shortAddress(listing.seller)}</code></div>
                    <div><span>PRICE</span><strong>{settlementAmount(listing.price)}</strong></div>
                    <div><span>LIFECYCLE / EXPIRY</span><strong>{name.lifecycle.toUpperCase()}</strong><time>{date(name.expiresAt)}</time><small>LISTING DEADLINE {date(listing.deadline)}</small></div>
                    <div className={styles.rowActions}>
                      {sameAddress(listing.seller, account.address) ? (
                        <>
                          <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-update", { tokenId: listing.tokenId.toString(), price: formatUnits(listing.price, v3BrowserManifest.settlement.decimals) })}>Update {name.fullName}</ActionButton>
                          <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-cancel", { tokenId: listing.tokenId.toString() })}>Cancel {name.fullName}</ActionButton>
                        </>
                      ) : (
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-buy", { tokenId: listing.tokenId.toString() })}>Buy {name.fullName}</ActionButton>
                      )}
                      <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-invalidate", { tokenId: listing.tokenId.toString() })}>Check stale</ActionButton>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
            <PageControls
              cursor={snapshot.listingsCursor}
              nextCursor={snapshot.listingsNextCursor}
              hasPrevious={pageHistory.listings.length > 0}
              busy={paging !== null || marketExecutionLocked}
              error={pageError === "listings"}
              onPrevious={() => void loadPage("listings", "previous")}
              onNext={() => void loadPage("listings", "next")}
            />
          </section>

          <section className={styles.section} aria-labelledby="v3-offers-heading">
            <header><span>02 / ESCROW</span><h2 id="v3-offers-heading">OFFERS</h2></header>
            {snapshot.offers.length === 0 ? (
              <div className={styles.empty}><strong>ZERO VERIFIED OFFERS</strong><p>No active or terminal offer was returned at the pinned block.</p></div>
            ) : (
              <div className={styles.rows}>
                {snapshot.offers.map((offer) => {
                  const name = requireV3MarketNameContext(snapshot.nameContexts, offer.tokenId);
                  return (
                  <article className={styles.row} key={offer.offerId}>
                    <div><span>OFFER</span><code title={offer.offerId}>{offer.offerId.slice(0, 12)}…</code></div>
                    <div><span>NAME / STATE</span><strong>{name.fullName}</strong><small>TOKEN {offer.tokenId.toString()} / {name.lifecycle.toUpperCase()} / OFFER {offer.state.toUpperCase()}</small><time>NAME EXPIRES {date(name.expiresAt)}</time></div>
                    <div><span>BUYER</span><code>{shortAddress(offer.buyer)}</code></div>
                    <div><span>AMOUNT</span><strong>{settlementAmount(offer.amount)}</strong></div>
                    <div className={styles.rowActions}>
                      {offer.state === "active" && sameAddress(offer.ownerSnapshot, account.address) && !offer.stale ? (
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-accept", { offerId: offer.offerId })}>Accept {name.fullName}</ActionButton>
                      ) : null}
                      {offer.state === "active" && sameAddress(offer.buyer, account.address) ? (
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-cancel", { offerId: offer.offerId })}>Cancel {name.fullName}</ActionButton>
                      ) : null}
                      {offer.state === "active" && offer.stale ? (
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("offer-invalidate", { offerId: offer.offerId })}>Invalidate</ActionButton>
                      ) : null}
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
            <PageControls
              cursor={snapshot.offersCursor}
              nextCursor={snapshot.offersNextCursor}
              hasPrevious={pageHistory.offers.length > 0}
              busy={paging !== null || marketExecutionLocked}
              error={pageError === "offers"}
              onPrevious={() => void loadPage("offers", "previous")}
              onNext={() => void loadPage("offers", "next")}
            />
          </section>

          <section className={styles.section} aria-labelledby="v3-auctions-heading">
            <header><span>03 / ENGLISH</span><h2 id="v3-auctions-heading">AUCTIONS</h2></header>
            {snapshot.auctions.length === 0 ? (
              <div className={styles.empty}><strong>ZERO VERIFIED AUCTIONS</strong><p>No auction custody exists at the pinned block.</p></div>
            ) : (
              <div className={styles.rows}>
                {snapshot.auctions.map((auction) => {
                  const name = requireV3MarketNameContext(snapshot.nameContexts, auction.tokenId);
                  return (
                  <article className={styles.row} key={auction.tokenId.toString()}>
                    <div><span>NAME</span><strong>{name.fullName}</strong><code>TOKEN {auction.tokenId.toString()}</code></div>
                    <div><span>RESERVE</span><strong>{settlementAmount(auction.reservePrice)}</strong></div>
                    <div><span>HIGHEST BID</span><strong>{settlementAmount(auction.highestBid)}</strong></div>
                    <div><span>ENDS / NAME EXPIRY</span><time>{date(auction.endAt)}</time><strong>{name.lifecycle.toUpperCase()}</strong><small>NAME EXPIRES {date(name.expiresAt)}</small></div>
                    <div className={styles.rowActions}>
                      <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-bid", { tokenId: auction.tokenId.toString() })}>Bid on {name.fullName}</ActionButton>
                      {sameAddress(auction.seller, account.address) && auction.highestBid === 0n ? (
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-cancel", { tokenId: auction.tokenId.toString() })}>Cancel {name.fullName}</ActionButton>
                      ) : null}
                      <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-finalize", { tokenId: auction.tokenId.toString() })}>Finalize {name.fullName}</ActionButton>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
            <PageControls
              cursor={snapshot.auctionsCursor}
              nextCursor={snapshot.auctionsNextCursor}
              hasPrevious={pageHistory.auctions.length > 0}
              busy={paging !== null || marketExecutionLocked}
              error={pageError === "auctions"}
              onPrevious={() => void loadPage("auctions", "previous")}
              onNext={() => void loadPage("auctions", "next")}
            />
          </section>

          {account.address ? (
            <section className={styles.section} aria-labelledby="v3-owner-heading">
              <header><span>04 / OWNER</span><h2 id="v3-owner-heading">NAMES &amp; CLAIMS</h2></header>
              <div className={styles.accountGrid}>
                <div>
                  <span>REFERRAL CREDIT</span>
                  <strong>{snapshot.balances ? settlementAmount(snapshot.balances.referralRewards) : "UNAVAILABLE"}</strong>
                  <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("claim", { claimKind: "referral" })}>Claim referral</ActionButton>
                </div>
                <div>
                  <span>UNIFIED MARKET CREDIT</span>
                  <strong>{snapshot.balances ? settlementAmount(snapshot.balances.marketplaceClaimable) : "UNAVAILABLE"}</strong>
                  <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("claim", { claimKind: "seller-proceeds" })}>Claim market balance</ActionButton>
                </div>
              </div>
              {snapshot.ownedNames.length === 0 ? (
                <div className={styles.empty}><strong>ZERO OWNED ACTIVE NAMES</strong><p>No owner action is inferred from this result.</p></div>
              ) : (
                <div className={styles.ownedNames}>
                  {snapshot.ownedNames.map((name) => (
                    <article key={name.tokenId.toString()}>
                      <div><span>NAME</span><strong>{name.fullName}</strong><code>TOKEN {name.tokenId.toString()}</code></div>
                      <div className={styles.rowActions}>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("marketplace-approve", { tokenId: name.tokenId.toString() })}>Approve one token</ActionButton>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("fixed-list", { tokenId: name.tokenId.toString() })}>List</ActionButton>
                        <ActionButton disabled={marketExecutionLocked} onClick={() => selectAction("auction-create", { tokenId: name.tokenId.toString() })}>Auction</ActionButton>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <section className={styles.composer} ref={formRef} aria-labelledby="v3-action-heading" aria-busy={marketExecutionLocked}>
        <header>
          <span>GUARDED TRANSACTION COMPOSER</span>
          <h2 id="v3-action-heading">PREPARE ONE ACTION</h2>
          <p>Reads never sign. Every write is re-prepared, simulated, externally signed, confirmed and reconciled.</p>
        </header>
        <div className={styles.formGrid}>
          <label className={styles.actionSelect}>
            <span>ACTION</span>
            <select
              value={form.action}
              disabled={marketExecutionLocked}
              onChange={(event) => setForm((current) => ({ ...current, action: event.target.value as V3MarketActionKind }))}
            >
              <optgroup label="Token approval">
                <option value="marketplace-approve">Approve one token for marketplace</option>
              </optgroup>
              <optgroup label="Fixed price">
                <option value="fixed-list">List</option>
                <option value="fixed-update">Update listing</option>
                <option value="fixed-cancel">Cancel listing</option>
                <option value="fixed-invalidate">Invalidate stale listing</option>
                <option value="fixed-buy">Buy</option>
              </optgroup>
              <optgroup label="Escrowed offer">
                <option value="offer-create">Create offer</option>
                <option value="offer-accept">Accept offer</option>
                <option value="offer-cancel">Cancel offer</option>
                <option value="offer-invalidate">Invalidate stale offer</option>
              </optgroup>
              <optgroup label="English auction">
                <option value="auction-create">Create auction</option>
                <option value="auction-bid">Bid</option>
                <option value="auction-cancel">Cancel auction</option>
                <option value="auction-finalize">Finalize auction</option>
              </optgroup>
              <optgroup label="Pull payment">
                <option value="claim">Claim unified balance</option>
              </optgroup>
            </select>
          </label>

          {needsToken ? <Field label="TOKEN ID" value={form.tokenId} onChange={(tokenId) => setForm((current) => ({ ...current, tokenId }))} inputMode="numeric" disabled={marketExecutionLocked} /> : null}
          {needsOffer ? <Field label="OFFER ID / BYTES32" value={form.offerId} onChange={(offerId) => setForm((current) => ({ ...current, offerId }))} disabled={marketExecutionLocked} /> : null}
          {needsPrice ? <Field label={form.action === "auction-create" ? "RESERVE PRICE" : "PRICE"} value={form.price} onChange={(price) => setForm((current) => ({ ...current, price }))} inputMode="decimal" suffix={v3BrowserManifest.settlement.symbol} disabled={marketExecutionLocked} /> : null}
          {needsAmount ? <Field label={form.action === "auction-bid" ? "BID AMOUNT" : "OFFER AMOUNT"} value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} inputMode="decimal" suffix={v3BrowserManifest.settlement.symbol} disabled={marketExecutionLocked} /> : null}
          {needsDeadline ? <Field label="DEADLINE" type="datetime-local" value={form.deadline} onChange={(deadline) => setForm((current) => ({ ...current, deadline }))} disabled={marketExecutionLocked} /> : null}
          {form.action === "auction-create" ? (
            <>
              <Field label="START" type="datetime-local" value={form.startAt} onChange={(startAt) => setForm((current) => ({ ...current, startAt }))} disabled={marketExecutionLocked} />
              <Field label="END" type="datetime-local" value={form.endAt} onChange={(endAt) => setForm((current) => ({ ...current, endAt }))} disabled={marketExecutionLocked} />
            </>
          ) : null}
          {needsRecipient ? <Field label="RECIPIENT" value={form.recipient} onChange={(recipient) => setForm((current) => ({ ...current, recipient }))} disabled={marketExecutionLocked} /> : null}
          {form.action === "claim" ? (
            <label>
              <span>CLAIM SOURCE</span>
              <select value={form.claimKind} disabled={marketExecutionLocked} onChange={(event) => setForm((current) => ({ ...current, claimKind: event.target.value as V3ClaimKind }))}>
                <option value="referral">Referral rewards</option>
                <option value="seller-proceeds">Marketplace balance — seller proceeds</option>
                <option value="offer-refund">Marketplace balance — offer refund</option>
                <option value="outbid-refund">Marketplace balance — outbid refund</option>
                <option value="auction-refund">Marketplace balance — auction refund</option>
              </select>
            </label>
          ) : null}
        </div>
        <div className={styles.formSummary}>
          <span>{V3_MARKET_ACTION_COPY[form.action].group} / {V3_MARKET_ACTION_COPY[form.action].title.toUpperCase()}</span>
          <strong>{marketExecutionLocked ? "A MARKET WALLET OPERATION IS IN PROGRESS" : intentResult.error ?? "FORM VALID / LOAD FRESH ONCHAIN GUARDS NEXT"}</strong>
          {form.action === "marketplace-approve" ? <p>This creates only ERC-721 per-token approval. It never requests unlimited setApprovalForAll authority.</p> : null}
          {form.action === "claim" && form.claimKind !== "referral" ? <p>Offer, outbid, auction and seller credits share one onchain marketplace claimable balance and one claim selector.</p> : null}
        </div>
      </section>

      {!account.address ? (
        <section className={styles.state}><span>READ-ONLY MODE</span><h2>Connect a wallet to prepare guarded actions.</h2><WalletButton /></section>
      ) : account.chainId !== v3BrowserManifest.chainId ? (
        <section className={styles.state}><span>WRONG NETWORK</span><h2>Switch before loading transaction guards.</h2></section>
      ) : intentResult.intent && reader && execution ? (
        <V3MarketActionPanel
          release={release}
          account={account.address as Address}
          intent={intentResult.intent}
          reader={reader}
          execution={execution}
        />
      ) : (
        <section className={styles.state} role={intentResult.error ? "alert" : "status"}>
          <span>{intentResult.error ? "FORM INCOMPLETE" : "ADAPTER LOADING"}</span>
          <h2>{intentResult.error ?? "Verifying the V3 SDK and wallet adapter."}</h2>
        </section>
      )}
    </main>
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
