"use client";

import { CalendarClock, Check, Copy, ExternalLink, Link2, ReceiptText, Tags, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { WalletButton } from "@/components/wallet/wallet-button";
import { projectConfig } from "@/config/project.config";
import { TransactionStatus } from "@/features/transactions/transaction-status";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { renewalTiming } from "@/lib/renewal-reminders";
import { useAccountBalances, useOwnedNames, useProtocolTransaction } from "@/lib/contract/hooks";
import { NAME_STATUS } from "@/lib/contract/types";
import { formatBps } from "@/lib/settlement";
import styles from "./account-workspace.module.css";

type Tab = "names" | "referrals" | "listings";

const tabs: ReadonlyArray<{ id: Tab; label: string; icon: typeof UserRound }> = [
  { id: "names", label: "Names", icon: UserRound },
  { id: "referrals", label: "Referrals", icon: Link2 },
  { id: "listings", label: "Listings & proceeds", icon: Tags },
];

function lifecycle(status: number) {
  if (status === NAME_STATUS.ACTIVE) return "ACTIVE";
  if (status === NAME_STATUS.GRACE) return "GRACE";
  if (status === NAME_STATUS.RELEASED) return "RELEASED";
  return "UNREGISTERED";
}

function labelFromFullName(fullName: string) {
  const suffix = `.${projectConfig.brand.suffix}`;
  return fullName.endsWith(suffix) ? fullName.slice(0, -suffix.length) : fullName;
}

export function AccountWorkspace({ initialTab = "names" }: { initialTab?: Tab }) {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pagination, setPagination] = useState<{ account: string | undefined; offset: number }>({ account: address, offset: 0 });
  const [copied, setCopied] = useState(false);
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);
  const [origin] = useState(() => typeof window === "undefined"
    ? projectConfig.siteUrl.replace(/\/$/, "")
    : window.location.origin);
  const pageSize = projectConfig.marketplace.listingsPerPage;
  const ownedOffset = pagination.account === address ? pagination.offset : 0;
  const owned = useOwnedNames(address, ownedOffset, pageSize);
  const balances = useAccountBalances(address);
  const transaction = useProtocolTransaction();

  const referralUrl = address ? `${origin}/r/${address}` : "";
  const marketNames = owned.names;
  const expiringNames = nowSeconds === null
    ? []
    : owned.names
        .map((name) => ({ name, timing: renewalTiming(name.expiresAt, nowSeconds) }))
        .filter(({ name, timing }) => (
          name.expiresAt > 0n
          && timing.due
          && (name.status === NAME_STATUS.ACTIVE || name.status === NAME_STATUS.GRACE)
        ))
        .sort((left, right) => Number(left.name.expiresAt - right.name.expiresAt));

  useEffect(() => {
    const update = () => setNowSeconds(Math.floor(Date.now() / 1000));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  async function copyReferralLink() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function claim(functionName: "claimReferralRewards" | "claimSaleProceeds") {
    if (!address) return;
    await transaction.send({ functionName, args: [address] });
  }

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function setOwnedOffset(offset: number) {
    setPagination({ account: address, offset });
  }

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.kicker}>ACCOUNT / {projectConfig.chain.name.toUpperCase()}</div>
          <div className={styles.titleRow}>
            <h1>ME<span>/</span></h1>
            <div className={styles.accountState}>
              <span>{address ? "CONNECTED ADDRESS" : "WALLET REQUIRED"}</span>
              <strong>{address ? shortenAddress(address, 6) : "NOT CONNECTED"}</strong>
            </div>
          </div>
          <div className={styles.metrics}>
            <div><span>OWNED NAMES</span><strong>{address ? owned.total : "-"}</strong></div>
            <div><span>PRIMARY</span><strong>{balances.primaryName || "Not set"}</strong></div>
            <div><span>REFERRAL BALANCE</span><strong><SettlementAmount amountBaseUnits={balances.referralBalance} /></strong></div>
            <div><span>SALE PROCEEDS</span><strong><SettlementAmount amountBaseUnits={balances.sellerBalance} /></strong></div>
          </div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.inner}>
          <div className={styles.tabs} role="tablist" aria-label="Account sections">
            {tabs.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => selectTab(item.id)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {!address ? (
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.emptyState}>
              <span>01 / WALLET</span>
              <h2>Connect the address that owns your names.</h2>
              <p>Your names, rewards, listings, and proceeds will appear here.</p>
              <WalletButton />
            </div>
          ) : !protocolDeployed ? (
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.emptyState}>
              <span>PRE-DEPLOYMENT</span>
              <h2>Account access is not available on {projectConfig.chain.name} yet.</h2>
              <p>Connect again after the service launches on this network.</p>
            </div>
          ) : null}

          {address && protocolDeployed && tab === "names" ? (
            <div id="panel-names" role="tabpanel" aria-labelledby="tab-names" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>01 / NAMES</span>
                <h2>Your names</h2>
                {balances.primaryName ? (
                  <Button variant="quiet" onClick={() => void transaction.send({ functionName: "clearPrimaryName" })}>
                    Clear primary
                  </Button>
                ) : null}
              </div>
              {expiringNames.length ? (
                <div className={styles.renewalSummary}>
                  <CalendarClock size={20} aria-hidden="true" />
                  <div>
                    <span>RENEWAL WINDOW / CURRENT PAGE</span>
                    <strong>{expiringNames.length} {expiringNames.length === 1 ? "name needs" : "names need"} attention</strong>
                  </div>
                  <Link href={`/name/${encodeURIComponent(labelFromFullName(expiringNames[0]!.name.fullName))}`}>
                    Review nearest
                  </Link>
                </div>
              ) : null}
              {owned.isLoading ? <p className={styles.loading}>Loading your names...</p> : null}
              {owned.error ? <p className={styles.error}>Your names could not be loaded. Try again.</p> : null}
              {!owned.isLoading && owned.total === 0 ? (
                <div className={styles.inlineEmpty}><p>No names are owned by this address.</p><Link href="/">Search names</Link></div>
              ) : (
                <div className={styles.rows}>
                  {owned.names.map((name) => {
                    const label = labelFromFullName(name.fullName);
                    const timing = nowSeconds === null ? null : renewalTiming(name.expiresAt, nowSeconds);
                    return (
                      <Link href={`/name/${encodeURIComponent(label)}`} className={styles.nameRow} key={name.tokenId.toString()}>
                        <span className={styles.rowIndex}>{name.tokenId.toString().slice(0, 6)}</span>
                        <strong>{name.fullName}</strong>
                        <span>{balances.primaryName === name.fullName ? `PRIMARY / ${lifecycle(name.status)}` : lifecycle(name.status)}</span>
                        <span className={timing?.due ? styles.expiring : undefined}>
                          {name.expiresAt ? timing?.due ? timing.label : formatDate(name.expiresAt) : "-"}
                        </span>
                        <span>{name.listing ? <SettlementAmount amountBaseUnits={name.listing.price} /> : "NOT LISTED"}</span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              )}
              {owned.total > pageSize ? (
                <div className={styles.pagination}>
                  <Button variant="quiet" disabled={ownedOffset === 0} onClick={() => setOwnedOffset(Math.max(0, ownedOffset - pageSize))}>Previous</Button>
                  <span>{ownedOffset + 1}-{Math.min(ownedOffset + pageSize, owned.total)} / {owned.total}</span>
                  <Button variant="quiet" disabled={ownedOffset + pageSize >= owned.total} onClick={() => setOwnedOffset(ownedOffset + pageSize)}>Next</Button>
                </div>
              ) : null}
              <TransactionStatus transaction={transaction} />
            </div>
          ) : null}

          {address && protocolDeployed && tab === "referrals" ? (
            <div id="panel-referrals" role="tabpanel" aria-labelledby="tab-referrals" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>02 / REFERRALS</span>
                <h2>Share your link. Claim your rewards.</h2>
              </div>
              <div className={styles.referralGrid}>
                <div className={styles.referralLink}>
                  <span>YOUR REFERRAL LINK</span>
                  <code>{referralUrl}</code>
                  <Button icon={copied ? <Check size={17} /> : <Copy size={17} />} onClick={() => void copyReferralLink()}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
                <div className={styles.claimBlock}>
                  <span>CLAIMABLE REWARDS</span>
                  <strong><SettlementAmount amountBaseUnits={balances.referralBalance} /></strong>
                  <Button
                    icon={<ReceiptText size={17} />}
                    disabled={balances.referralBalance === 0n || transaction.isPending || transaction.isConfirming}
                    onClick={() => void claim("claimReferralRewards")}
                  >
                    Claim to this wallet
                  </Button>
                </div>
              </div>
              <div className={styles.steps}>
                <div><span>01</span><strong>SHARE</strong><p>Your address is attached to the visitor for {projectConfig.referrals.attributionDays} days.</p></div>
                <div><span>02</span><strong>REGISTER</strong><p>A successful registration through your link earns the displayed {formatBps(deploymentManifest.referralRewardBps)} reward.</p></div>
                <div><span>03</span><strong>CLAIM</strong><p>Your rewards remain available until you claim them.</p></div>
              </div>
              <TransactionStatus transaction={transaction} />
            </div>
          ) : null}

          {address && protocolDeployed && tab === "listings" ? (
            <div id="panel-listings" role="tabpanel" aria-labelledby="tab-listings" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>03 / MARKET</span>
                <h2>Listings and proceeds</h2>
              </div>
              <div className={styles.proceeds}>
                <div><span>CLAIMABLE PROCEEDS</span><strong><SettlementAmount amountBaseUnits={balances.sellerBalance} /></strong></div>
                <Button
                  icon={<ReceiptText size={17} />}
                  disabled={balances.sellerBalance === 0n || transaction.isPending || transaction.isConfirming}
                  onClick={() => void claim("claimSaleProceeds")}
                >
                  Claim to this wallet
                </Button>
              </div>
              {owned.total === 0 ? (
                <div className={styles.inlineEmpty}><p>You do not own a name to list.</p><Link href="/">Search names</Link></div>
              ) : (
                <div className={styles.rows}>
                  {marketNames.map((name) => {
                    const label = labelFromFullName(name.fullName);
                    return (
                      <Link href={`/name/${encodeURIComponent(label)}`} className={styles.listingRow} key={name.tokenId.toString()}>
                        <strong>{name.fullName}</strong>
                        <span>{name.listing ? <SettlementAmount amountBaseUnits={name.listing.price} /> : "NOT LISTED"}</span>
                        <span>{name.listing ? `${formatBps(name.listing.feeBps)} FEE` : "MANAGE NAME"}</span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              )}
              <TransactionStatus transaction={transaction} />
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
