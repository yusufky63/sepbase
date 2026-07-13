"use client";

import { CalendarClock, Check, Copy, ExternalLink, Link2, ReceiptText, Tags, UserRound } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { WalletButton } from "@/components/wallet/wallet-button";
import { projectConfig } from "@/config/project.config";
import { TransactionStatus } from "@/features/transactions/transaction-status";
import { configuredChain } from "@/lib/chain";
import { deploymentManifest, protocolAddress, protocolDeployed } from "@/lib/deployment-manifest";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { renewalTiming } from "@/lib/renewal-reminders";
import { useAccountBalances, useOwnedNames, useProtocolTransaction } from "@/lib/contract/hooks";
import { NAME_STATUS, type OwnedName } from "@/lib/contract/types";
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

export function ownedNameLabel(fullName: unknown): string | null {
  if (typeof fullName !== "string" || fullName.length === 0) return null;
  const suffix = `.${projectConfig.brand.suffix}`;
  if (!fullName.endsWith(suffix)) return null;
  const label = fullName.slice(0, -suffix.length);
  return label.length > 0 ? label : null;
}

export function isRenderableOwnedName(value: unknown): value is OwnedName {
  if (value === null || typeof value !== "object") return false;
  const name = value as Partial<OwnedName>;
  const listingValid = name.listing === null || (
    name.listing !== undefined
    && typeof name.listing === "object"
    && typeof name.listing.price === "bigint"
    && typeof name.listing.feeBps === "number"
  );
  return typeof name.tokenId === "bigint"
    && name.tokenId >= 0n
    && ownedNameLabel(name.fullName) !== null
    && typeof name.expiresAt === "bigint"
    && name.expiresAt >= 0n
    && (
      name.status === NAME_STATUS.UNREGISTERED
      || name.status === NAME_STATUS.ACTIVE
      || name.status === NAME_STATUS.GRACE
      || name.status === NAME_STATUS.RELEASED
    )
    && listingValid;
}

export function validateClaimRecipient(value: string): { address: Address | null; error: string | null } {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return { address: null, error: "Enter a valid EVM address." };
  const recipient = getAddress(trimmed);
  if (recipient.toLowerCase() === zeroAddress) return { address: null, error: "The zero address cannot receive a claim." };
  if (protocolAddress && recipient.toLowerCase() === protocolAddress.toLowerCase()) {
    return { address: null, error: "The protocol contract cannot receive a claim." };
  }
  return { address: recipient, error: null };
}

export function accountTabIndexForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function AccountWorkspace({ initialTab = "names" }: { initialTab?: Tab }) {
  const { address, chainId } = useAccount();
  const wrongNetwork = Boolean(address && chainId !== configuredChain.id);
  const contractReadAccount = wrongNetwork ? undefined : address;
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pagination, setPagination] = useState<{ account: string | undefined; offset: number }>({ account: address, offset: 0 });
  const [claimRecipients, setClaimRecipients] = useState<{
    account: Address | undefined;
    referral: string;
    sale: string;
  }>({ account: address, referral: address ?? "", sale: address ?? "" });
  const [copied, setCopied] = useState(false);
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);
  const [origin] = useState(() => typeof window === "undefined"
    ? projectConfig.siteUrl.replace(/\/$/, "")
    : window.location.origin);
  const pageSize = projectConfig.marketplace.listingsPerPage;
  const ownedOffset = pagination.account === address ? pagination.offset : 0;
  const owned = useOwnedNames(contractReadAccount, ownedOffset, pageSize);
  const balances = useAccountBalances(contractReadAccount);
  const transaction = useProtocolTransaction();
  const referralRecipientInput = claimRecipients.account === address ? claimRecipients.referral : (address ?? "");
  const saleRecipientInput = claimRecipients.account === address ? claimRecipients.sale : (address ?? "");
  const referralRecipient = validateClaimRecipient(referralRecipientInput);
  const saleRecipient = validateClaimRecipient(saleRecipientInput);

  const referralUrl = address ? `${origin}/r/${address}` : "";
  const decodedOwnedNames = owned.names.flatMap((name) => {
    if (!isRenderableOwnedName(name)) return [];
    const label = ownedNameLabel(name.fullName);
    return label === null ? [] : [{ name, label }];
  });
  const ownedDataInvalid = decodedOwnedNames.length !== owned.names.length;
  const ownedReadUnavailable = Boolean(owned.error) || ownedDataInvalid;
  const displayOwnedNames = ownedReadUnavailable ? [] : decodedOwnedNames;
  const marketNames = displayOwnedNames;
  const expiringNames = nowSeconds === null
    ? []
    : displayOwnedNames
        .map((item) => ({ ...item, timing: renewalTiming(item.name.expiresAt, nowSeconds) }))
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

  async function claim(
    functionName: "claimReferralRewards" | "claimSaleProceeds",
    recipient: Address | null,
  ) {
    if (!address || !recipient) return;
    await transaction.send({ functionName, args: [recipient] });
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

  function updateClaimRecipient(kind: "referral" | "sale", value: string) {
    setClaimRecipients((current) => ({
      account: address,
      referral: kind === "referral" ? value : current.account === address ? current.referral : (address ?? ""),
      sale: kind === "sale" ? value : current.account === address ? current.sale : (address ?? ""),
    }));
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = accountTabIndexForKey(event.key, index, tabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex]!;
    selectTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
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
            <div><span>OWNED NAMES</span><strong>{!address || wrongNetwork || !protocolDeployed ? "-" : owned.isLoading ? "Checking" : ownedReadUnavailable ? "Unavailable" : owned.total ?? "Unavailable"}</strong></div>
            <div><span>PRIMARY</span><strong>{!address || wrongNetwork || !protocolDeployed ? "-" : balances.isLoading ? "Checking" : balances.primaryName === null ? "Unavailable" : balances.primaryName || "Not set"}</strong></div>
            <div><span>REFERRAL BALANCE</span><strong>{!address || wrongNetwork || !protocolDeployed ? "-" : balances.referralBalance === null ? "Unavailable" : <SettlementAmount amountBaseUnits={balances.referralBalance} />}</strong></div>
            <div><span>SALE PROCEEDS</span><strong>{!address || wrongNetwork || !protocolDeployed ? "-" : balances.sellerBalance === null ? "Unavailable" : <SettlementAmount amountBaseUnits={balances.sellerBalance} />}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.inner}>
          <div className={styles.tabs} role="tablist" aria-label="Account sections" aria-orientation="horizontal">
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
                  tabIndex={tab === item.id ? 0 : -1}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
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
          ) : wrongNetwork ? (
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.emptyState}>
              <span>NETWORK REQUIRED</span>
              <h2>Switch to {configuredChain.name} to view this account.</h2>
              <p>Your wallet remains connected. Switch networks to load names and balances, or disconnect safely.</p>
              <WalletButton />
            </div>
          ) : !protocolDeployed ? (
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.emptyState}>
              <span>PRE-DEPLOYMENT</span>
              <h2>Account access is not available on {projectConfig.chain.name} yet.</h2>
              <p>Connect again after the service launches on this network.</p>
            </div>
          ) : null}

          {address && !wrongNetwork && protocolDeployed && tab === "names" ? (
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
                  <Link href={`/name/${encodeURIComponent(expiringNames[0]!.label)}`}>
                    Review nearest
                  </Link>
                </div>
              ) : null}
              {owned.isLoading ? <p className={styles.loading}>Loading your names...</p> : null}
              {ownedReadUnavailable ? <p className={styles.error} role="alert">Your names could not be verified. No partial account data is shown; retry when the read is available.</p> : null}
              {!owned.isLoading && !ownedReadUnavailable && owned.total === 0 ? (
                <div className={styles.inlineEmpty}><p>No names are owned by this address.</p><Link href="/">Search names</Link></div>
              ) : (
                <div className={styles.rows}>
                  {displayOwnedNames.map(({ name, label }) => {
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
              {owned.total !== null && owned.total > pageSize ? (
                <div className={styles.pagination}>
                  <Button variant="quiet" disabled={ownedOffset === 0} onClick={() => setOwnedOffset(Math.max(0, ownedOffset - pageSize))}>Previous</Button>
                  <span>{ownedOffset + 1}-{Math.min(ownedOffset + pageSize, owned.total)} / {owned.total}</span>
                  <Button variant="quiet" disabled={ownedOffset + pageSize >= owned.total} onClick={() => setOwnedOffset(ownedOffset + pageSize)}>Next</Button>
                </div>
              ) : null}
              <TransactionStatus transaction={transaction} />
            </div>
          ) : null}

          {address && !wrongNetwork && protocolDeployed && tab === "referrals" ? (
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
                  <strong>{balances.referralBalance === null ? "Unavailable" : <SettlementAmount amountBaseUnits={balances.referralBalance} />}</strong>
                  <div className={styles.claimRecipient}>
                    <label htmlFor="referral-claim-recipient">Recipient</label>
                    <input
                      id="referral-claim-recipient"
                      value={referralRecipientInput}
                      onChange={(event) => updateClaimRecipient("referral", event.target.value)}
                      aria-invalid={referralRecipient.error !== null}
                      aria-describedby="referral-claim-recipient-status"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small
                      id="referral-claim-recipient-status"
                      className={referralRecipient.error ? styles.fieldError : styles.fieldHint}
                    >
                      {referralRecipient.error ?? `Verified recipient: ${referralRecipient.address}`}
                    </small>
                  </div>
                  {balances.error ? <p className={styles.error} role="alert">The claimable reward balance could not be verified.</p> : null}
                  <Button
                    icon={<ReceiptText size={17} />}
                    disabled={balances.referralBalance === null || balances.referralBalance === 0n || referralRecipient.address === null || transaction.isPending || transaction.isConfirming}
                    onClick={() => void claim("claimReferralRewards", referralRecipient.address)}
                  >
                    Claim rewards
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

          {address && !wrongNetwork && protocolDeployed && tab === "listings" ? (
            <div id="panel-listings" role="tabpanel" aria-labelledby="tab-listings" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>03 / MARKET</span>
                <h2>Listings and proceeds</h2>
              </div>
              <div className={styles.proceeds}>
                <div><span>CLAIMABLE PROCEEDS</span><strong>{balances.sellerBalance === null ? "Unavailable" : <SettlementAmount amountBaseUnits={balances.sellerBalance} />}</strong></div>
                <div className={styles.claimRecipient}>
                  <label htmlFor="sale-claim-recipient">Recipient</label>
                  <input
                    id="sale-claim-recipient"
                    value={saleRecipientInput}
                    onChange={(event) => updateClaimRecipient("sale", event.target.value)}
                    aria-invalid={saleRecipient.error !== null}
                    aria-describedby="sale-claim-recipient-status"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small
                    id="sale-claim-recipient-status"
                    className={saleRecipient.error ? styles.fieldError : styles.fieldHint}
                  >
                    {saleRecipient.error ?? `Verified recipient: ${saleRecipient.address}`}
                  </small>
                </div>
                <Button
                  icon={<ReceiptText size={17} />}
                  disabled={balances.sellerBalance === null || balances.sellerBalance === 0n || saleRecipient.address === null || transaction.isPending || transaction.isConfirming}
                  onClick={() => void claim("claimSaleProceeds", saleRecipient.address)}
                >
                  Claim proceeds
                </Button>
              </div>
              {balances.error ? <p className={styles.error} role="alert">The claimable proceeds balance could not be verified.</p> : null}
              {ownedReadUnavailable ? <p className={styles.error} role="alert">Your listings could not be verified. No partial listing data is shown; try again.</p> : null}
              {!ownedReadUnavailable && owned.total === 0 ? (
                <div className={styles.inlineEmpty}><p>You do not own a name to list.</p><Link href="/">Search names</Link></div>
              ) : (
                <div className={styles.rows}>
                  {marketNames.map(({ name, label }) => {
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
