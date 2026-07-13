"use client";

import {
  ExternalLink,
  Link2,
  ReceiptText,
  RefreshCw,
  Send,
  Tags,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import type { V3NameRecord } from "@sepbase/sdk";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useConfiguredChainSwitch } from "@/components/wallet/use-configured-chain-switch";
import { formatDate, shortenAddress } from "@/lib/formatting";
import { useV3PlanExecution } from "@/lib/use-v3-plan-execution";
import {
  getV3BrowserClient,
  isV3ManifestOperational,
  v3BrowserManifest,
} from "@/lib/v3-browser-runtime";
import {
  loadV3AccountSnapshot,
  prepareV3AccountAction,
  validateV3AddressRecord,
  validateV3Recipient,
  validateV3TextRecord,
  v3AccountTabIndexForKey,
  v3PrimaryPermission,
  type V3AccountAction,
  type V3AccountTab,
} from "./v3-account-model";
import styles from "./v3-account-workspace.module.css";

const PAGE_SIZE = 12n;
const tabs: ReadonlyArray<{ id: V3AccountTab; label: string; icon: typeof UserRound }> = [
  { id: "names", label: "Names & records", icon: UserRound },
  { id: "referrals", label: "Referral rewards", icon: Link2 },
  { id: "listings", label: "Market balance", icon: Tags },
];

function assetAmount(amount: bigint) {
  return `${formatUnits(amount, v3BrowserManifest.settlement.decimals)} ${v3BrowserManifest.settlement.symbol}`;
}

function stageCopy(stage: ReturnType<typeof useV3PlanExecution>["stage"]) {
  const copy = {
    idle: "No transaction is pending.",
    preparing: "Checking the latest name and balance details.",
    "approval-check": "Checking payment permission.",
    "approval-simulating": "Preparing payment permission.",
    "approval-signing": "Confirm payment permission in your wallet.",
    "approval-confirming": "Waiting for payment permission.",
    refreshing: "Refreshing the final amount and ownership.",
    simulating: "Running a final safety check.",
    signing: "Review and sign the transaction in your wallet.",
    confirming: "Waiting for transaction confirmation.",
    confirmed: "Transaction confirmed.",
    error: "The action was not completed. Refresh and try again.",
  } as const;
  return copy[stage];
}

function operationAvailable(record: V3NameRecord | null) {
  return record?.status === "active" || record?.status === "grace";
}

export function V3AccountWorkspace({ initialTab = "names" }: { initialTab?: V3AccountTab }) {
  const account = useAccount();
  const chainSwitch = useConfiguredChainSwitch();
  const execution = useV3PlanExecution();
  const [tab, setTab] = useState<V3AccountTab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [cursor, setCursor] = useState(0n);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [durationYears, setDurationYears] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [addressDraft, setAddressDraft] = useState<{ tokenId: bigint; value: string } | null>(null);
  const [textDraft, setTextDraft] = useState<{ tokenId: bigint; key: string; value: string } | null>(null);
  const [transferDraft, setTransferDraft] = useState<{ tokenId: bigint; value: string } | null>(null);
  const [claimDrafts, setClaimDrafts] = useState<{
    account: Address | undefined;
    referral: string;
    marketplace: string;
  }>({ account: account.address, referral: account.address ?? "", marketplace: account.address ?? "" });

  const operational = isV3ManifestOperational();
  const correctChain = account.chainId === v3BrowserManifest.chainId;
  const queryAccount = account.address;
  const accountQuery = useQuery({
    queryKey: ["v3-account", v3BrowserManifest.suiteReleaseId, queryAccount ?? null, cursor.toString()],
    enabled: operational && Boolean(queryAccount) && correctChain,
    retry: false,
    queryFn: async () => {
      if (!queryAccount) throw new Error("V3_WALLET_NOT_READY");
      const client = await getV3BrowserClient();
      const snapshot = await loadV3AccountSnapshot(client, queryAccount, cursor, Number(PAGE_SIZE));
      return { account: queryAccount, cursor, client, snapshot };
    },
  });
  const queryData = accountQuery.data;
  const currentReady = queryData
    && queryData.account === queryAccount
    && queryData.cursor === cursor
    ? queryData
    : null;

  const names = currentReady?.snapshot.names.items ?? [];
  const selected = names.find((record) => record.tokenId === selectedTokenId) ?? names[0] ?? null;
  const quoteKey = selected && currentReady
    ? `${selected.tokenId}:${durationYears}:${currentReady.snapshot.blockNumber}`
    : null;
  const quoteQuery = useQuery({
    queryKey: ["v3-renew-quote", v3BrowserManifest.suiteReleaseId, quoteKey],
    enabled: Boolean(quoteKey && selected && currentReady && operationAvailable(selected)),
    retry: false,
    queryFn: () => {
      if (!selected || !currentReady) throw new Error("V3_NAME_NOT_READY");
      return currentReady.client.quoteRegistration(
        selected.label,
        durationYears,
        currentReady.snapshot.blockNumber,
      );
    },
  });
  const addressInput = selected
    ? addressDraft?.tokenId === selected.tokenId
      ? addressDraft.value
      : selected.resolvedAddress ?? account.address ?? ""
    : "";
  const transferInput = selected && transferDraft?.tokenId === selected.tokenId
    ? transferDraft.value
    : "";
  const textKey = selected && textDraft?.tokenId === selected.tokenId ? textDraft.key : "url";
  const textValue = selected && textDraft?.tokenId === selected.tokenId ? textDraft.value : "";
  const addressRecord = validateV3AddressRecord(addressInput);
  const transferRecipient = validateV3Recipient(transferInput, v3BrowserManifest);
  const textError = validateV3TextRecord(textKey, textValue);
  const primaryPermission = selected && account.address
    ? v3PrimaryPermission(selected, account.address)
    : { allowed: false, reason: "Select an owned name." };
  const referralInput = claimDrafts.account === account.address
    ? claimDrafts.referral
    : account.address ?? "";
  const marketplaceInput = claimDrafts.account === account.address
    ? claimDrafts.marketplace
    : account.address ?? "";
  const referralRecipient = validateV3Recipient(referralInput, v3BrowserManifest);
  const marketplaceRecipient = validateV3Recipient(marketplaceInput, v3BrowserManifest);

  function selectTab(nextTab: V3AccountTab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = v3AccountTabIndexForKey(event.key, index, tabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex]!;
    selectTab(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  async function runAction(action: V3AccountAction) {
    const sender = account.address;
    if (!sender || !currentReady || execution.isPending) return;
    execution.reset();
    try {
      await execution.execute((client) => prepareV3AccountAction(client, sender, action));
      if (action.kind === "transfer") {
        setCursor(0n);
        setSelectedTokenId(null);
      }
      await accountQuery.refetch();
    } catch {
      // The shared executor exposes a sanitized UI state and never marks a failed receipt complete.
    }
  }

  function submit(event: FormEvent, action: V3AccountAction | null) {
    event.preventDefault();
    if (action) void runAction(action);
  }

  function setClaimDraft(kind: "referral" | "marketplace", value: string) {
    setClaimDrafts((current) => ({
      account: account.address,
      referral: kind === "referral" ? value : current.account === account.address ? current.referral : account.address ?? "",
      marketplace: kind === "marketplace" ? value : current.account === account.address ? current.marketplace : account.address ?? "",
    }));
  }

  if (!operational) {
    return (
      <section className={styles.boundary}>
        <span>ACCOUNT</span>
        <h1>Account tools are not available yet.</h1>
        <p>This release is still being prepared. No wallet action has been requested.</p>
      </section>
    );
  }

  if (!account.address) {
    return (
      <section className={styles.boundary}>
        <span>ACCOUNT</span>
        <h1>Connect the wallet that owns your names.</h1>
        <p>Your names and balances will appear after you connect.</p>
        <WalletButton />
      </section>
    );
  }

  if (!correctChain) {
    return (
      <section className={styles.boundary}>
        <span>WRONG NETWORK</span>
        <h1>Switch to {v3BrowserManifest.chainName}.</h1>
        <p>Your wallet must be on the same network as your names.</p>
        <Button
          onClick={() => void chainSwitch.switchToConfiguredChain()}
          disabled={chainSwitch.isSwitching}
        >
          {chainSwitch.isSwitching ? "Switching network" : `Switch to ${v3BrowserManifest.chainName}`}
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.kicker}>ACCOUNT / {v3BrowserManifest.chainName.toUpperCase()}</div>
          <div className={styles.titleRow}>
            <h1>ME<span>/</span></h1>
            <div className={styles.accountState}>
              <span>CONNECTED WALLET</span>
              <strong title={account.address}>{shortenAddress(account.address, 6)}</strong>
            </div>
          </div>
          <div className={styles.metrics} aria-live="polite">
            <div>
              <span>OWNED NAMES</span>
              <strong>{currentReady ? currentReady.snapshot.names.total.toString() : accountQuery.isError ? "UNAVAILABLE" : "CHECKING"}</strong>
            </div>
            <div>
              <span>PRIMARY</span>
              <strong>{currentReady
                ? currentReady.snapshot.balances.primary.verified
                  ? currentReady.snapshot.balances.primary.name
                  : "NOT VERIFIED"
                : accountQuery.isError ? "UNAVAILABLE" : "CHECKING"}</strong>
            </div>
            <div>
              <span>REFERRAL REWARDS</span>
              <strong>{currentReady ? assetAmount(currentReady.snapshot.balances.referralRewards) : accountQuery.isError ? "UNAVAILABLE" : "CHECKING"}</strong>
            </div>
            <div>
              <span>MARKET BALANCE</span>
              <strong>{currentReady ? assetAmount(currentReady.snapshot.balances.marketplaceClaimable) : accountQuery.isError ? "UNAVAILABLE" : "CHECKING"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.inner}>
          <div className={styles.snapshotBar}>
            <span>ACCOUNT DATA</span>
            <strong>{currentReady ? "UP TO DATE" : accountQuery.isError ? "UNAVAILABLE" : "LOADING"}</strong>
            <Button
              variant="quiet"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => void accountQuery.refetch()}
              disabled={accountQuery.isFetching || execution.isPending}
            >
              Refresh
            </Button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Account sections">
            {tabs.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`v3-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`v3-panel-${item.id}`}
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

          {!currentReady && !accountQuery.isError ? (
            <div className={styles.state} role="status">
              <span>ACCOUNT</span>
              <h2>Loading your names and balances.</h2>
            </div>
          ) : null}

          {accountQuery.isError ? (
            <div className={`${styles.state} ${styles.errorState}`} role="alert">
              <span>ACCOUNT UNAVAILABLE</span>
              <h2>We couldn&apos;t load your account.</h2>
              <p>Balances are unavailable and are not being shown as zero.</p>
              <Button variant="quiet" onClick={() => void accountQuery.refetch()}>Try again</Button>
            </div>
          ) : null}

          {currentReady && tab === "names" ? (
            <div id="v3-panel-names" role="tabpanel" aria-labelledby="v3-tab-names" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>01 / OWNERSHIP</span>
                <h2>Names, records, renewal, and transfer</h2>
                <small>Manage one name at a time.</small>
              </div>

              {currentReady.snapshot.names.total === 0n ? (
                <div className={styles.emptyState}>
                  <p>This wallet does not own any V3 names yet.</p>
                  <Link href="/">Search names</Link>
                </div>
              ) : (
                <div className={styles.nameLayout}>
                  <div className={styles.nameList} aria-label="Owned V3 names">
                    {names.map((record) => (
                      <button
                        type="button"
                        key={record.tokenId.toString()}
                        aria-pressed={selected?.tokenId === record.tokenId}
                        onClick={() => setSelectedTokenId(record.tokenId)}
                      >
                        <span>{record.status.toUpperCase()}</span>
                        <strong>{record.fullName}</strong>
                        <small>{record.expiresAt ? formatDate(record.expiresAt) : "No expiration"}</small>
                      </button>
                    ))}
                    {currentReady.snapshot.names.total > PAGE_SIZE ? (
                      <div className={styles.pagination}>
                        <Button
                          variant="quiet"
                          disabled={cursor === 0n || execution.isPending}
                          onClick={() => {
                            setSelectedTokenId(null);
                            setCursor(cursor > PAGE_SIZE ? cursor - PAGE_SIZE : 0n);
                          }}
                        >Previous</Button>
                        <span>{cursor + 1n}-{currentReady.snapshot.names.nextCursor} / {currentReady.snapshot.names.total}</span>
                        <Button
                          variant="quiet"
                          disabled={currentReady.snapshot.names.nextCursor >= currentReady.snapshot.names.total || execution.isPending}
                          onClick={() => {
                            setSelectedTokenId(null);
                            setCursor(currentReady.snapshot.names.nextCursor);
                          }}
                        >Next</Button>
                      </div>
                    ) : null}
                  </div>

                  {selected ? (
                    <div className={styles.nameActions}>
                      <div className={styles.nameSummary}>
                        <div><span>SELECTED</span><strong>{selected.fullName}</strong></div>
                        <div><span>STATUS</span><strong>{selected.status.toUpperCase()}</strong></div>
                        <div><span>ADDRESS</span><code>{selected.resolvedAddress ?? "NOT SET"}</code></div>
                        <div><span>EXPIRES</span><strong>{selected.expiresAt ? formatDate(selected.expiresAt) : "NO EXPIRY"}</strong></div>
                      </div>

                      <form className={styles.actionForm} onSubmit={(event) => submit(event, {
                        kind: "renew",
                        tokenId: selected.tokenId,
                        durationYears,
                      })}>
                        <div className={styles.formHeading}><span>RENEW</span><strong>Extend lifecycle</strong></div>
                        <label htmlFor="v3-renew-years">Term</label>
                        <select
                          id="v3-renew-years"
                          value={durationYears}
                          onChange={(event) => setDurationYears(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)}
                          disabled={execution.isPending}
                        >
                          {v3BrowserManifest.nameRules.allowedYears.map((year) => <option value={year} key={year}>{year} year{year === 1 ? "" : "s"}</option>)}
                        </select>
                        <div className={styles.reviewValue}>
                          <span>RENEWAL PRICE</span>
                          <strong>{quoteQuery.data !== undefined ? assetAmount(quoteQuery.data) : quoteQuery.isError ? "UNAVAILABLE" : "CHECKING"}</strong>
                          <small>The exact amount is checked again before your wallet signs.</small>
                        </div>
                        <Button type="submit" disabled={!operationAvailable(selected) || quoteQuery.data === undefined || execution.isPending}>Renew name</Button>
                      </form>

                      <form className={styles.actionForm} onSubmit={(event) => submit(event,
                        addressRecord.address ? { kind: "set-address", label: selected.label, target: addressRecord.address } : null,
                      )}>
                        <div className={styles.formHeading}><span>ADDRESS</span><strong>Choose where this name points</strong></div>
                        <label htmlFor="v3-address-record">EVM address</label>
                        <input
                          id="v3-address-record"
                          value={addressInput}
                          onChange={(event) => setAddressDraft({ tokenId: selected.tokenId, value: event.target.value })}
                          aria-invalid={addressRecord.error !== null}
                          aria-describedby="v3-address-record-help"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <small id="v3-address-record-help" className={addressRecord.error ? styles.fieldError : styles.fieldHint}>
                          {addressRecord.error ?? "Use the zero address only if you want to clear this value."}
                        </small>
                        <Button type="submit" disabled={!operationAvailable(selected) || !addressRecord.address || execution.isPending}>Set address</Button>
                      </form>

                      <form className={styles.actionForm} onSubmit={(event) => submit(event,
                        textError ? null : { kind: "set-text", label: selected.label, key: textKey, value: textValue },
                      )}>
                        <div className={styles.formHeading}><span>PUBLIC PROFILE</span><strong>Add a profile field</strong></div>
                        <label htmlFor="v3-text-key">Profile field</label>
                        <input
                          id="v3-text-key"
                          value={textKey}
                          onChange={(event) => setTextDraft({ tokenId: selected.tokenId, key: event.target.value, value: textValue })}
                          placeholder="url"
                          aria-invalid={textError !== null}
                          aria-describedby="v3-text-help"
                        />
                        <label htmlFor="v3-text-value">Profile value</label>
                        <textarea
                          id="v3-text-value"
                          value={textValue}
                          onChange={(event) => setTextDraft({ tokenId: selected.tokenId, key: textKey, value: event.target.value })}
                          rows={3}
                          aria-invalid={textError !== null}
                          aria-describedby="v3-text-help"
                        />
                        <small id="v3-text-help" className={textError ? styles.fieldError : styles.fieldHint}>{textError ?? "This information is public. Do not add private details."}</small>
                        <Button type="submit" disabled={!operationAvailable(selected) || textError !== null || execution.isPending}>Set text record</Button>
                      </form>

                      <div className={styles.actionForm}>
                        <div className={styles.formHeading}><span>PRIMARY NAME</span><strong>Use this as your wallet name</strong></div>
                        <p>{primaryPermission.allowed
                          ? `${selected.fullName} resolves to the connected owner and can become primary.`
                          : primaryPermission.reason}</p>
                        <Button
                          onClick={() => void runAction({ kind: "set-primary", tokenId: selected.tokenId })}
                          disabled={!primaryPermission.allowed || execution.isPending
                            || (currentReady.snapshot.balances.primary.verified && currentReady.snapshot.balances.primary.name === selected.fullName)}
                        >
                          {currentReady.snapshot.balances.primary.verified && currentReady.snapshot.balances.primary.name === selected.fullName
                            ? "Current primary"
                            : "Set primary"}
                        </Button>
                        {currentReady.snapshot.balances.primary.name ? (
                          <Button
                            variant="quiet"
                            onClick={() => void runAction({ kind: "clear-primary" })}
                            disabled={execution.isPending}
                          >
                            Clear primary
                          </Button>
                        ) : null}
                      </div>

                      <form className={`${styles.actionForm} ${styles.dangerForm}`} onSubmit={(event) => submit(event,
                        transferRecipient.address ? { kind: "transfer", tokenId: selected.tokenId, recipient: transferRecipient.address } : null,
                      )}>
                        <div className={styles.formHeading}><span>TRANSFER</span><strong>Send ownership safely</strong></div>
                        <label htmlFor="v3-transfer-recipient">Recipient</label>
                        <input
                          id="v3-transfer-recipient"
                          value={transferInput}
                          onChange={(event) => setTransferDraft({ tokenId: selected.tokenId, value: event.target.value })}
                          aria-invalid={transferRecipient.error !== null}
                          aria-describedby="v3-transfer-help"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <small id="v3-transfer-help" className={transferRecipient.error ? styles.fieldError : styles.fieldHint}>
                          {transferRecipient.error ?? "The recipient becomes the new owner. Review the address carefully."}
                        </small>
                        <Button variant="danger" type="submit" icon={<Send size={16} aria-hidden="true" />} disabled={!operationAvailable(selected) || !transferRecipient.address || execution.isPending}>Transfer name</Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              )}

            </div>
          ) : null}

          {currentReady && tab === "referrals" ? (
            <div id="v3-panel-referrals" role="tabpanel" aria-labelledby="v3-tab-referrals" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>02 / REFERRALS</span>
                <h2>Claim registration rewards</h2>
                <small>Rewards become available after successful referred registrations.</small>
              </div>
              <div className={styles.claimGrid}>
                <div className={styles.claimAmount} data-zero={currentReady.snapshot.balances.referralRewards === 0n}>
                  <span>{currentReady.snapshot.balances.referralRewards === 0n ? "NO REWARDS YET" : "AVAILABLE TO CLAIM"}</span>
                  <strong>{assetAmount(currentReady.snapshot.balances.referralRewards)}</strong>
                  <p>Rewards are credited after a referred registration completes.</p>
                </div>
                <form onSubmit={(event) => submit(event,
                  referralRecipient.address ? { kind: "claim-referral", recipient: referralRecipient.address } : null,
                )}>
                  <label htmlFor="v3-referral-recipient">Claim recipient</label>
                  <input
                    id="v3-referral-recipient"
                    value={referralInput}
                    onChange={(event) => setClaimDraft("referral", event.target.value)}
                    aria-invalid={referralRecipient.error !== null}
                    aria-describedby="v3-referral-help"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small id="v3-referral-help" className={referralRecipient.error ? styles.fieldError : styles.fieldHint}>
                    {referralRecipient.error ?? `Verified recipient: ${referralRecipient.address}`}
                  </small>
                  <Button type="submit" icon={<ReceiptText size={16} aria-hidden="true" />} disabled={currentReady.snapshot.balances.referralRewards === 0n || !referralRecipient.address || execution.isPending}>Claim rewards</Button>
                </form>
              </div>
            </div>
          ) : null}

          {currentReady && tab === "listings" ? (
            <div id="v3-panel-listings" role="tabpanel" aria-labelledby="v3-tab-listings" className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>03 / MARKET</span>
                <h2>Claim proceeds and refunds</h2>
                <small>Sale proceeds and refundable offers or bids appear together.</small>
              </div>
              <div className={styles.claimGrid}>
                <div className={styles.claimAmount} data-zero={currentReady.snapshot.balances.marketplaceClaimable === 0n}>
                  <span>{currentReady.snapshot.balances.marketplaceClaimable === 0n ? "NO BALANCE TO CLAIM" : "AVAILABLE TO CLAIM"}</span>
                  <strong>{assetAmount(currentReady.snapshot.balances.marketplaceClaimable)}</strong>
                  <p>Claim the available balance to the address you choose.</p>
                </div>
                <form onSubmit={(event) => submit(event,
                  marketplaceRecipient.address ? { kind: "claim-marketplace", recipient: marketplaceRecipient.address } : null,
                )}>
                  <label htmlFor="v3-market-recipient">Claim recipient</label>
                  <input
                    id="v3-market-recipient"
                    value={marketplaceInput}
                    onChange={(event) => setClaimDraft("marketplace", event.target.value)}
                    aria-invalid={marketplaceRecipient.error !== null}
                    aria-describedby="v3-market-help"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small id="v3-market-help" className={marketplaceRecipient.error ? styles.fieldError : styles.fieldHint}>
                    {marketplaceRecipient.error ?? `Verified recipient: ${marketplaceRecipient.address}`}
                  </small>
                  <Button type="submit" icon={<ReceiptText size={16} aria-hidden="true" />} disabled={currentReady.snapshot.balances.marketplaceClaimable === 0n || !marketplaceRecipient.address || execution.isPending}>Claim market balance</Button>
                </form>
              </div>
              <div className={styles.marketLink}>
                <p>Listings, offers and auctions are managed from the market.</p>
                <Link href="/market">Open market <ExternalLink size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          ) : null}

          {currentReady ? (
            <div className={styles.transactionState} data-state={execution.stage} aria-live="polite">
              <div>
                <span>TRANSACTION</span>
                <strong>{stageCopy(execution.stage)}</strong>
              </div>
              {execution.result ? (
                <a href={`${v3BrowserManifest.explorerUrl}/tx/${execution.result.hash}`} target="_blank" rel="noreferrer">
                  View confirmed transaction <ExternalLink size={15} aria-hidden="true" />
                </a>
              ) : null}
              {execution.error ? <p role="alert">The action was not completed. Refresh your account and try again.</p> : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
