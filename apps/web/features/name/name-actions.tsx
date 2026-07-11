"use client";

import { ArrowRightLeft, BadgeCheck, CircleDollarSign, Pencil, RefreshCw, ShoppingBag, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, isAddress, zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SettlementAmount } from "@/components/price/settlement-amount";
import { WalletButton } from "@/components/wallet/wallet-button";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { protocolErrorMessage } from "@/lib/errors";
import { shortenAddress } from "@/lib/formatting";
import { annualPriceForLength } from "@/lib/pricing";
import { clearReferralAttribution, referralCookieName } from "@/lib/referrals";
import { formatBps, formatSettlementAmount, parseSettlementAmount } from "@/lib/settlement";
import { profileValidationError } from "@/lib/profile";
import { queueTransactionNotice } from "@/lib/transaction-notice";
import {
  useProtocolHealth,
  useProtocolTransaction,
  useQuote,
  useAccountBalances,
} from "@/lib/contract/hooks";
import { NAME_STATUS, type NameProfile, type NameRecord } from "@/lib/contract/types";
import { useSettlementApproval } from "@/features/transactions/settlement-approval";
import { TransactionComplete } from "@/features/transactions/transaction-complete";
import { TransactionStatus } from "@/features/transactions/transaction-status";
import txStyles from "@/features/transactions/transactions.module.css";
import styles from "./name-actions.module.css";

type Action = "register" | "renew" | "profile" | "primary" | "transfer" | "list" | "cancel" | "buy" | null;

function DurationSelector({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <p className={txStyles.fieldLabel}>REGISTRATION TERM</p>
      <div className={txStyles.segments} role="group" aria-label="Registration years">
        {projectConfig.names.allowedYears.map((year) => (
          <button key={year} type="button" aria-pressed={value === year} onClick={() => onChange(year)}>
            {year}Y
          </button>
        ))}
      </div>
    </div>
  );
}

function amountLabel(amount: bigint) {
  return `${formatSettlementAmount(amount, deploymentManifest.settlement.decimals)} ${deploymentManifest.settlement.symbol}`;
}

function referralFromCookie(): Address | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${referralCookieName}=`))
    ?.split("=")[1];
  return raw && isAddress(raw) && raw.toLowerCase() !== zeroAddress ? raw : null;
}

type RegisterConfirmationProps = {
  amount: bigint;
  label: string;
  onClose: () => void;
  onConfirmed: () => void | Promise<unknown>;
  onReferralConsumed: () => void;
  quoteError: boolean;
  quoteReady: boolean;
  referralRewardBps: number;
  referrer: Address | null;
  years: number;
};

function RegisterConfirmation({
  amount,
  label,
  onClose,
  onConfirmed,
  onReferralConsumed,
  quoteError,
  quoteReady,
  referralRewardBps,
  referrer,
  years,
}: RegisterConfirmationProps) {
  const router = useRouter();
  const { address } = useAccount();
  const health = useProtocolHealth();
  const transaction = useProtocolTransaction();
  const approval = useSettlementApproval(amount);
  const confirmationHandled = useRef(false);

  useEffect(() => {
    if (!transaction.isSuccess || confirmationHandled.current) return;
    confirmationHandled.current = true;
    clearReferralAttribution();
    const timer = window.setTimeout(() => {
      onReferralConsumed();
      void onConfirmed();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onConfirmed, onReferralConsumed, transaction.isSuccess]);

  if (transaction.isSuccess) {
    return (
      <TransactionComplete
        hash={transaction.hash}
        title="Registration complete"
        message={`${label}.${projectConfig.brand.suffix} is registered to your connected wallet.`}
        primaryLabel="Open my names"
        onPrimary={() => { onClose(); router.push("/me?tab=names"); }}
        secondaryLabel="View updated name"
        onSecondary={onClose}
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!address) return;
    await transaction.send({
      functionName: "register",
      args: [
        label,
        years,
        address,
        referrer ?? "0x0000000000000000000000000000000000000000",
        amount,
        referrer ? referralRewardBps : 0,
      ],
      value: deploymentManifest.settlement.kind === "native" ? amount : undefined,
    });
  }

  return (
    <form className={txStyles.form} onSubmit={submit}>
      <div className={txStyles.summary}>
        <div><span>Name</span><strong>{label}.{projectConfig.brand.suffix}</strong></div>
        <div><span>Registration term</span><strong>{years} {years === 1 ? "year" : "years"}</strong></div>
        <div><span>Application payment</span><strong><SettlementAmount amountBaseUnits={amount} /></strong></div>
        <div><span>Network fee</span><strong>{projectConfig.chain.nativeCurrency.symbol} / wallet estimate</strong></div>
        <div>
          <span>Referral</span>
          <strong>{referrer ? `${formatBps(referralRewardBps)} / ${shortenAddress(referrer, 4)}` : "None"}</strong>
        </div>
      </div>
      <TransactionStatus transaction={transaction} />
      {quoteError ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">The current registration quote could not be verified.</div> : null}
      {approval.error ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">{protocolErrorMessage(approval.error)}</div> : null}
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        {!address ? (
          <WalletButton />
        ) : !approval.ready ? (
          <Button type="button" disabled>{approval.error ? "Payment unavailable" : "Checking allowance..."}</Button>
        ) : approval.required ? (
          <Button
            type="button"
            onClick={() => void approval.approve()}
            disabled={!address || !quoteReady || approval.isPending || approval.isConfirming}
          >
            {approval.isPending || approval.isConfirming ? "Approving..." : `Approve ${amountLabel(amount)}`}
          </Button>
        ) : (
          <Button type="submit" disabled={!quoteReady || transaction.isPending || transaction.isConfirming || health.registrationsPaused || !health.solvent}>
            Register name
          </Button>
        )}
      </div>
    </form>
  );
}

function RenewForm({ record, onClose }: { record: NameRecord; onClose: () => void }) {
  const { address } = useAccount();
  const [years, setYears] = useState(1);
  const quote = useQuote(record.label, years);
  const transaction = useProtocolTransaction();
  const health = useProtocolHealth();
  const amount = (quote.data as bigint | undefined) ?? record.oneYearQuote * BigInt(years);
  const approval = useSettlementApproval(amount);
  const quoteReady = quote.data !== undefined && !quote.isError;

  if (transaction.isSuccess) {
    return (
      <TransactionComplete
        hash={transaction.hash}
        title="Renewal complete"
        message={`${record.label}.${projectConfig.brand.suffix} now includes the confirmed renewal term.`}
        primaryLabel="Done"
        onPrimary={onClose}
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await transaction.send({
      functionName: "renew",
      args: [record.tokenId, years, amount],
      value: deploymentManifest.settlement.kind === "native" ? amount : undefined,
    });
  }

  return (
    <form className={txStyles.form} onSubmit={submit}>
      <DurationSelector value={years} onChange={setYears} />
      <div className={txStyles.summary}>
        <div><span>Name</span><strong>{record.label}.{projectConfig.brand.suffix}</strong></div>
        <div><span>Application payment</span><strong><SettlementAmount amountBaseUnits={amount} /></strong></div>
        <div><span>Network fee</span><strong>{projectConfig.chain.nativeCurrency.symbol} / wallet estimate</strong></div>
      </div>
      <TransactionStatus transaction={transaction} />
      {quote.isError ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">The current renewal quote could not be verified.</div> : null}
      {approval.error ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">{protocolErrorMessage(approval.error)}</div> : null}
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        {!address ? (
          <WalletButton />
        ) : !approval.ready ? (
          <Button type="button" disabled>{approval.error ? "Payment unavailable" : "Checking allowance..."}</Button>
        ) : approval.required ? (
          <Button type="button" onClick={() => void approval.approve()} disabled={!quoteReady || approval.isPending || approval.isConfirming}>
            Approve payment
          </Button>
        ) : (
          <Button type="submit" disabled={!quoteReady || transaction.isPending || transaction.isConfirming || !health.solvent}>
            Renew name
          </Button>
        )}
      </div>
    </form>
  );
}

function ProfileForm({ record, onClose }: { record: NameRecord; onClose: () => void }) {
  const transaction = useProtocolTransaction();
  const [profile, setProfile] = useState<NameProfile>(record.profile);
  const [resolved, setResolved] = useState(record.resolvedAddress ?? record.owner ?? "");
  const validationError = useMemo(() => profileValidationError(profile), [profile]);

  if (transaction.isSuccess) {
    return (
      <TransactionComplete
        hash={transaction.hash}
        title="Profile updated"
        message="The new resolution and public profile data are confirmed onchain."
        primaryLabel="Done"
        onPrimary={onClose}
      />
    );
  }

  function update(field: keyof NameProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAddress(resolved) || validationError) return;
    await transaction.send({ functionName: "updateNameData", args: [record.tokenId, resolved, profile] });
  }

  return (
    <form className={txStyles.form} onSubmit={submit}>
      <div className={txStyles.field}>
        <label htmlFor="resolved">Resolved address</label>
        <input id="resolved" value={resolved} onChange={(event) => setResolved(event.target.value)} required />
      </div>
      <div className={txStyles.field}>
        <label htmlFor="display-name">Display name</label>
        <input id="display-name" maxLength={64} value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} />
      </div>
      <div className={txStyles.field}>
        <label htmlFor="bio">Bio</label>
        <textarea id="bio" maxLength={280} value={profile.bio} onChange={(event) => update("bio", event.target.value)} />
      </div>
      {(["avatar", "website", "twitter", "github"] as const).map((field) => (
        <div className={txStyles.field} key={field}>
          <label htmlFor={field}>{field === "twitter" ? "X username" : `${field[0]?.toUpperCase()}${field.slice(1)}`}</label>
          <input id={field} value={profile[field]} onChange={(event) => update(field, event.target.value)} />
        </div>
      ))}
      {validationError ? <p className={txStyles.error} role="alert">{validationError}</p> : null}
      <p className={txStyles.warning}>Profile fields are public onchain data. Clearing a current value does not erase historical chain data.</p>
      <p className={txStyles.warning}>If this name no longer points to your wallet, it will be removed as your primary name.</p>
      <TransactionStatus transaction={transaction} />
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!isAddress(resolved) || Boolean(validationError) || transaction.isPending || transaction.isConfirming}>Save onchain</Button>
      </div>
    </form>
  );
}

function TransferForm({ record, onClose }: { record: NameRecord; onClose: () => void }) {
  const [recipient, setRecipient] = useState("");
  const transaction = useProtocolTransaction();
  const recipientValid = isAddress(recipient) && recipient.toLowerCase() !== zeroAddress;
  if (transaction.isSuccess) {
    return (
      <TransactionComplete
        hash={transaction.hash}
        title="Transfer complete"
        message={`${record.label}.${projectConfig.brand.suffix} was transferred and its previous profile settings were cleared.`}
        primaryLabel="Done"
        onPrimary={onClose}
      />
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!record.owner || !recipientValid) return;
    await transaction.send({ functionName: "safeTransferFrom", args: [record.owner, recipient, record.tokenId] });
  }
  return (
    <form className={txStyles.form} onSubmit={submit}>
      <div className={txStyles.field}>
        <label htmlFor="transfer-recipient">Recipient</label>
        <input id="transfer-recipient" placeholder="0x..." value={recipient} onChange={(event) => setRecipient(event.target.value)} required />
      </div>
      <p className={txStyles.warning}>Transfer clears the current profile, primary mapping, listing, and resets resolution to the recipient.</p>
      <TransactionStatus transaction={transaction} />
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!recipientValid || transaction.isPending || transaction.isConfirming}>Transfer name</Button>
      </div>
    </form>
  );
}

function ListForm({ record, onClose }: { record: NameRecord; onClose: () => void }) {
  const router = useRouter();
  const [wasListed] = useState(record.listing !== null);
  const [price, setPrice] = useState(
    record.listing ? formatSettlementAmount(record.listing.price, deploymentManifest.settlement.decimals) : "",
  );
  const health = useProtocolHealth();
  const transaction = useProtocolTransaction();
  let baseUnits = 0n;
  try { baseUnits = parseSettlementAmount(price, deploymentManifest.settlement.decimals); }
  catch { baseUnits = 0n; }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (baseUnits === 0n) return;
    await transaction.send({ functionName: "listForSale", args: [record.tokenId, baseUnits, health.marketplaceFeeBps] });
  }
  const fee = (baseUnits / 10_000n) * BigInt(health.marketplaceFeeBps)
    + ((baseUnits % 10_000n) * BigInt(health.marketplaceFeeBps)) / 10_000n;
  if (transaction.isSuccess) {
    return (
      <TransactionComplete
        hash={transaction.hash}
        title={wasListed ? "Listing updated" : "Name listed"}
        message={`${record.label}.${projectConfig.brand.suffix} is confirmed at ${amountLabel(baseUnits)}.`}
        primaryLabel="Open market"
        onPrimary={() => {
          queueTransactionNotice(
            wasListed ? "listing-updated" : "listed",
            `${record.label}.${projectConfig.brand.suffix}`,
          );
          onClose();
          router.push("/market");
        }}
        secondaryLabel="Close"
        onSecondary={onClose}
      />
    );
  }
  return (
    <form className={txStyles.form} onSubmit={submit}>
      <div className={txStyles.field}>
        <label htmlFor="listing-price">Price in {deploymentManifest.settlement.symbol}</label>
        <input id="listing-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.01" />
      </div>
      <div className={txStyles.summary}>
        <div><span>Listing price</span><strong><SettlementAmount amountBaseUnits={baseUnits} /></strong></div>
        <div><span>Marketplace fee</span><strong>{formatBps(health.marketplaceFeeBps)}</strong></div>
        <div><span>Seller proceeds</span><strong><SettlementAmount amountBaseUnits={baseUnits - fee} /></strong></div>
      </div>
      <TransactionStatus transaction={transaction} />
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={baseUnits === 0n || transaction.isPending || transaction.isConfirming || health.marketplacePaused || !health.solvent}>{record.listing ? "Update listing" : "List name"}</Button>
      </div>
    </form>
  );
}

function ConfirmForm({
  action,
  record,
  onClose,
}: {
  action: "primary" | "cancel" | "buy";
  record: NameRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const transaction = useProtocolTransaction();
  const health = useProtocolHealth();
  const approval = useSettlementApproval(action === "buy" && record.listing ? record.listing.price : 0n);
  async function confirm() {
    if (action === "primary") await transaction.send({ functionName: "setPrimaryName", args: [record.tokenId] });
    if (action === "cancel") await transaction.send({ functionName: "cancelListing", args: [record.tokenId] });
    if (action === "buy" && record.listing) {
      await transaction.send({
        functionName: "buyListedName",
        args: [record.tokenId, record.listing.price],
        value: deploymentManifest.settlement.kind === "native" ? record.listing.price : undefined,
      });
    }
  }
  if (transaction.isSuccess) {
    const fullName = `${record.label}.${projectConfig.brand.suffix}`;
    const noticeKind = action === "buy" ? "purchased" : action === "cancel" ? "listing-removed" : null;
    const completion = action === "buy"
      ? {
          title: "Purchase complete",
          message: `${record.label}.${projectConfig.brand.suffix} is now owned by your connected wallet.`,
          primaryLabel: "Open my names",
          href: "/me?tab=names",
        }
      : action === "cancel"
        ? {
            title: "Listing removed",
            message: `${record.label}.${projectConfig.brand.suffix} is no longer offered on the market.`,
            primaryLabel: "Open market",
            href: "/market",
          }
        : {
            title: "Primary name set",
            message: `${record.label}.${projectConfig.brand.suffix} is confirmed as your primary name.`,
            primaryLabel: "Done",
            href: null,
          };
    return (
      <TransactionComplete
        hash={transaction.hash}
        title={completion.title}
        message={completion.message}
        primaryLabel={completion.primaryLabel}
        onPrimary={() => {
          if (noticeKind) queueTransactionNotice(noticeKind, fullName);
          onClose();
          if (completion.href) router.push(completion.href);
        }}
        secondaryLabel={completion.href ? "Close" : undefined}
        onSecondary={completion.href ? onClose : undefined}
      />
    );
  }
  return (
    <div className={txStyles.form}>
      <div className={txStyles.summary}>
        <div><span>Name</span><strong>{record.label}.{projectConfig.brand.suffix}</strong></div>
        {action === "buy" && record.listing ? <div><span>Price</span><strong><SettlementAmount amountBaseUnits={record.listing.price} /></strong></div> : null}
      </div>
      {action === "buy" ? <p className={txStyles.warning}>Purchase transfers the NFT and resets the seller profile and primary mapping.</p> : null}
      <TransactionStatus transaction={transaction} />
      {approval.error ? <div className={`${txStyles.notice} ${txStyles.error}`} role="alert">{protocolErrorMessage(approval.error)}</div> : null}
      <div className={txStyles.actions}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        {action === "buy" && !address ? (
          <WalletButton />
        ) : action === "buy" && !approval.ready ? (
          <Button disabled>{approval.error ? "Payment unavailable" : "Checking allowance..."}</Button>
        ) : action === "buy" && approval.required ? (
          <Button
            onClick={() => void approval.approve()}
            disabled={approval.isPending || approval.isConfirming}
          >
            {approval.isPending || approval.isConfirming ? "Approving..." : "Approve payment"}
          </Button>
        ) : (
          <Button
            onClick={() => void confirm()}
            disabled={
              transaction.isPending
              || transaction.isConfirming
              || (action === "buy" && (health.marketplacePaused || !health.solvent))
            }
          >
            {action === "primary" ? "Set primary" : action === "cancel" ? "Cancel listing" : "Buy name"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function NameActions({
  record,
  isPreview,
  onRecordRefresh,
}: {
  record: NameRecord;
  isPreview: boolean;
  onRecordRefresh: () => void | Promise<unknown>;
}) {
  const [action, setAction] = useState<Action>(null);
  const [registrationYears, setRegistrationYears] = useState(1);
  const [registrationReferrer, setRegistrationReferrer] = useState<Address | null>(() => referralFromCookie());
  const { address } = useAccount();
  const health = useProtocolHealth();
  const balances = useAccountBalances(address);
  const isOwner = Boolean(address && record.owner?.toLowerCase() === address.toLowerCase());
  const active = record.status === NAME_STATUS.ACTIVE;
  const grace = record.status === NAME_STATUS.GRACE;
  const canRegister = record.available && !record.reserved;
  const registrationQuote = useQuote(record.label, registrationYears, canRegister || action === "register");
  const registrationAmount = (registrationQuote.data as bigint | undefined)
    ?? annualPriceForLength(
      BigInt(deploymentManifest.annualPriceBaseUnits),
      record.label.length,
      deploymentManifest.shortNamePriceMultipliers,
    ) * BigInt(registrationYears);
  const registrationQuoteReady = registrationQuote.data !== undefined && !registrationQuote.isError;
  const selfReferral = Boolean(
    address && registrationReferrer?.toLowerCase() === address.toLowerCase(),
  );
  const effectiveReferrer = selfReferral ? null : registrationReferrer;
  const clearRegistrationReferral = useCallback(() => {
    setRegistrationReferrer(null);
    clearReferralAttribution();
  }, []);
  const consumeRegistrationReferral = useCallback(() => setRegistrationReferrer(null), []);
  const registrationState = health.registrationsPaused
    ? "REGISTRATION PAUSED"
    : !health.solvent
      ? "PROTOCOL UNAVAILABLE"
      : registrationQuote.isError
        ? "QUOTE ERROR"
        : registrationQuoteReady
          ? "QUOTE VERIFIED"
          : "VERIFYING QUOTE";

  if (isPreview || !protocolDeployed) {
    return (
      <div className={styles.actionBar}>
        <div><span>NOT AVAILABLE</span><strong>Registration is not available on {projectConfig.chain.name} yet.</strong></div>
        <Button disabled>Register</Button>
      </div>
    );
  }

  const buttons = [];
  if (active || grace) buttons.push(<Button key="renew" variant="secondary" disabled={!health.solvent} onClick={() => setAction("renew")} icon={<RefreshCw size={18} />}>Renew</Button>);
  if (isOwner && (active || grace)) {
    buttons.push(<Button key="profile" variant="secondary" onClick={() => setAction("profile")} icon={<Pencil size={18} />}>Edit profile</Button>);
    const fullName = `${record.label}.${projectConfig.brand.suffix}`;
    const isPrimary = balances.primaryName === fullName;
    const forwardConfirmed = record.resolvedAddress?.toLowerCase() === address?.toLowerCase();
    buttons.push(
      <Button
        key="primary"
        variant="secondary"
        disabled={balances.isLoading || isPrimary || !forwardConfirmed}
        title={isPrimary ? "Current primary name" : forwardConfirmed ? undefined : "Resolve this name to the connected wallet first"}
        onClick={() => setAction("primary")}
        icon={isPrimary ? <BadgeCheck size={18} /> : <Tag size={18} />}
      >
        {isPrimary ? "Primary name" : "Set primary"}
      </Button>,
    );
    buttons.push(<Button key="transfer" variant="secondary" onClick={() => setAction("transfer")} icon={<ArrowRightLeft size={18} />}>Transfer</Button>);
  }
  if (isOwner && active) {
    buttons.push(<Button key="list" variant="secondary" disabled={health.marketplacePaused || !health.solvent} onClick={() => setAction("list")} icon={<CircleDollarSign size={18} />}>{record.listing ? "Update price" : "List for sale"}</Button>);
    if (record.listing) buttons.push(<Button key="cancel" variant="quiet" onClick={() => setAction("cancel")} icon={<X size={18} />}>Cancel listing</Button>);
  }
  if (!isOwner && active && record.listing) buttons.push(<Button key="buy" disabled={health.marketplacePaused || !health.solvent} onClick={() => setAction("buy")} icon={<ShoppingBag size={18} />}>Buy {amountLabel(record.listing.price)}</Button>);

  return (
    <>
      {canRegister ? (
        <section className={styles.registrationModule} aria-labelledby="registration-setup-title">
          <div className={styles.registrationHeading}>
            <span>01 / REGISTRATION</span>
            <h2 id="registration-setup-title">Configure before you confirm.</h2>
          </div>
          <div className={styles.registrationLayout}>
            <div className={styles.registrationTerm}>
              <DurationSelector value={registrationYears} onChange={setRegistrationYears} />
              <p>The selected term determines the exact settlement amount shown here and in the confirmation.</p>
            </div>
            <div className={styles.registrationFacts}>
              <div><span>FULL NAME</span><strong>{record.label}.{projectConfig.brand.suffix}</strong></div>
              <div><span>APPLICATION PAYMENT</span><strong><SettlementAmount amountBaseUnits={registrationAmount} /></strong></div>
              <div><span>NETWORK FEE</span><strong>{projectConfig.chain.nativeCurrency.symbol} / wallet estimate</strong></div>
              <div><span>REFERRAL REWARD</span><strong>{effectiveReferrer ? `${formatBps(health.referralRewardBps)} to referrer` : "None"}</strong></div>
            </div>
          </div>
          {effectiveReferrer ? (
            <div className={styles.registrationNotice}>
              <span>REFERRAL ATTRIBUTION</span>
              <strong>{shortenAddress(effectiveReferrer, 6)}</strong>
              <button type="button" onClick={clearRegistrationReferral}>Clear</button>
            </div>
          ) : null}
          {selfReferral ? (
            <div className={styles.registrationNotice}>
              <span>REFERRAL REMOVED</span>
              <strong>Self-referral cannot be applied to this registration.</strong>
            </div>
          ) : null}
          {registrationQuote.isError ? (
            <div className={styles.registrationError} role="alert">The current registration quote could not be verified.</div>
          ) : null}
          <div className={styles.registrationFooter}>
            <div aria-live="polite"><span>QUOTE STATUS</span><strong>{registrationState}</strong></div>
            <Button
              disabled={!registrationQuoteReady || health.registrationsPaused || !health.solvent}
              onClick={() => setAction("register")}
              icon={<BadgeCheck size={18} />}
            >
              Register
            </Button>
          </div>
        </section>
      ) : (
        <div className={styles.actions}>{buttons.length ? buttons : <p>No write action is available for this lifecycle state.</p>}</div>
      )}
      <Dialog
        open={action !== null}
        onClose={() => setAction(null)}
        critical={action === "buy" || action === "transfer"}
        title={
          action === "register" ? `Register ${record.label}.${projectConfig.brand.suffix}`
          : action === "renew" ? `Renew ${record.label}.${projectConfig.brand.suffix}`
          : action === "profile" ? "Edit onchain profile"
          : action === "primary" ? "Set primary name"
          : action === "transfer" ? "Transfer name"
          : action === "list" ? "Set marketplace price"
          : action === "cancel" ? "Cancel marketplace listing"
          : "Buy listed name"
        }
        description={action === "register"
          ? "Confirm the selected term and current settlement amount before signing."
          : "Review the latest name details before confirming in your wallet."}
      >
        {action === "register" ? (
          <RegisterConfirmation
            amount={registrationAmount}
            label={record.label}
            onClose={() => setAction(null)}
            onConfirmed={onRecordRefresh}
            onReferralConsumed={consumeRegistrationReferral}
            quoteError={registrationQuote.isError}
            quoteReady={registrationQuoteReady}
            referralRewardBps={health.referralRewardBps}
            referrer={effectiveReferrer}
            years={registrationYears}
          />
        ) : null}
        {action === "renew" ? <RenewForm record={record} onClose={() => setAction(null)} /> : null}
        {action === "profile" ? <ProfileForm record={record} onClose={() => setAction(null)} /> : null}
        {action === "transfer" ? <TransferForm record={record} onClose={() => setAction(null)} /> : null}
        {action === "list" ? <ListForm record={record} onClose={() => setAction(null)} /> : null}
        {action === "primary" || action === "cancel" || action === "buy" ? (
          <ConfirmForm action={action} record={record} onClose={() => setAction(null)} />
        ) : null}
      </Dialog>
    </>
  );
}
