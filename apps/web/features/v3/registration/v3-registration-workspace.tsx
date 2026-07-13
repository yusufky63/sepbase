"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, CircleSlash2 } from "lucide-react";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import type { SepbaseV3Client, V3NameRecord } from "@sepbase/sdk";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useConfiguredChainSwitch } from "@/components/wallet/use-configured-chain-switch";
import { createV3RegistrationFlowController } from "@/lib/v3-registration-flow";
import { getV3BrowserClient, isV3ManifestOperational, v3BrowserManifest } from "@/lib/v3-browser-runtime";
import { chainNameControllerV3Abi } from "@/lib/contract/v3-abi.generated";
import { clearV3ReferralAttribution, readV3ReferralAttribution } from "@/lib/referrals";
import { createV3WagmiAdapter } from "@/lib/use-v3-plan-execution";
import { shortenAddress } from "@/lib/formatting";
import {
  V3RegistrationPanel,
  V3RegistrationPreview,
  type V3RegistrationDuration,
  type V3RegistrationQuoteStatus,
} from "./v3-registration-panel";
import styles from "./v3-registration-workspace.module.css";

const publicTextKeys = ["avatar", "url", "com.twitter", "com.github"] as const;
const publicTextLabels: Record<(typeof publicTextKeys)[number], string> = {
  avatar: "Avatar",
  url: "Website",
  "com.twitter": "X / Twitter",
  "com.github": "GitHub",
};

type V3NameLoadState =
  | { key: string; status: "error" }
  | {
    key: string;
    status: "ready";
    client: SepbaseV3Client;
    record: V3NameRecord;
    textRecords: Record<string, string> | null;
    textRecordsUnavailable: boolean;
  };

type V3QuoteLoadState =
  | { key: string; status: "error" }
  | { amount: bigint; key: string; status: "ready" };

function safeExpiration(value: bigint | null) {
  if (value === null || value < 0n || value > 8_640_000_000_000n) return null;
  const date = new Date(Number(value) * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function NameHero({
  children,
  label,
  status,
  statusKind = "pending",
}: {
  children?: ReactNode;
  label: string;
  status: string;
  statusKind?: "available" | "pending" | "unavailable";
}) {
  const StatusIcon = statusKind === "available" ? CircleCheck : statusKind === "unavailable" ? CircleSlash2 : CircleDashed;
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.breadcrumb}>NAME / {label.toUpperCase()} / {v3BrowserManifest.chainName.toUpperCase()}</div>
        <div className={styles.nameTitle}>
          <h1>{label}<span>.{v3BrowserManifest.suffix}</span></h1>
          <div className={styles.nameStatus} data-kind={statusKind}>
            <StatusIcon size={18} aria-hidden="true" />
            <span>{status}</span>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function V3RegistrationWorkspace({ label }: { label: string }) {
  const account = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const chainSwitch = useConfiguredChainSwitch();
  const [storedLoad, setStoredLoad] = useState<V3NameLoadState | null>(null);
  const [storedQuote, setStoredQuote] = useState<V3QuoteLoadState | null>(null);
  const [durationYears, setDurationYears] = useState<V3RegistrationDuration>(1);
  const [referralDismissed, setReferralDismissed] = useState(false);
  const loadKey = `${v3BrowserManifest.suiteReleaseId}:${label}`;
  const currentLoad = storedLoad?.key === loadKey ? storedLoad : null;
  const client = currentLoad?.status === "ready" ? currentLoad.client : null;
  const record = currentLoad?.status === "ready" ? currentLoad.record : null;
  const textRecords = currentLoad?.status === "ready" ? currentLoad.textRecords : null;
  const textRecordsUnavailable = currentLoad?.status === "ready" && currentLoad.textRecordsUnavailable;
  const referral = referralDismissed ? null : readV3ReferralAttribution();
  const quoteKey = client && record?.available
    ? `${loadKey}:${record.blockNumber.toString()}:${durationYears}`
    : null;
  const currentQuote = storedQuote?.key === quoteKey ? storedQuote : null;
  const quoteStatus: V3RegistrationQuoteStatus = currentQuote?.status ?? "loading";
  const quoteAmount = currentQuote?.status === "ready" ? currentQuote.amount : null;

  useEffect(() => {
    let active = true;
    if (!isV3ManifestOperational()) return;
    void getV3BrowserClient()
      .then(async (nextClient) => {
        const nextRecord = await nextClient.getNameRecord(label);
        if (active) {
          setStoredLoad({
            key: loadKey,
            status: "ready",
            client: nextClient,
            record: nextRecord,
            textRecords: null,
            textRecordsUnavailable: false,
          });
        }
        if (!nextRecord.available) {
          try {
            const values = await Promise.all(publicTextKeys.map(async (key) => [
              key,
              await nextClient.resolveText(nextRecord.label, key, nextRecord.blockNumber),
            ] as const));
            if (active) {
              setStoredLoad({
                key: loadKey,
                status: "ready",
                client: nextClient,
                record: nextRecord,
                textRecords: Object.fromEntries(values),
                textRecordsUnavailable: false,
              });
            }
          } catch {
            if (active) {
              setStoredLoad({
                key: loadKey,
                status: "ready",
                client: nextClient,
                record: nextRecord,
                textRecords: null,
                textRecordsUnavailable: true,
              });
            }
          }
        }
      })
      .catch(() => {
        if (active) setStoredLoad({ key: loadKey, status: "error" });
      });
    return () => { active = false; };
  }, [label, loadKey]);

  useEffect(() => {
    let active = true;
    if (!client || !record?.available || !quoteKey) return;
    void client.quoteRegistration(record.label, durationYears, record.blockNumber)
      .then((amount) => {
        if (active) setStoredQuote({ amount, key: quoteKey, status: "ready" });
      })
      .catch(() => {
        if (active) setStoredQuote({ key: quoteKey, status: "error" });
      });
    return () => { active = false; };
  }, [client, durationYears, quoteKey, record]);

  const controller = useMemo(() => {
    if (!client || !publicClient || !account.address || !account.chainId) return null;
    const base = createV3WagmiAdapter({
      account: account.address,
      chainId: account.chainId,
      publicClient,
      sendTransaction: (request) => sendTransactionAsync(request as never),
    });
    return createV3RegistrationFlowController({
      client,
      transactions: {
        ...base,
        getWalletContext: async () => ({ account: account.address ?? null, chainId: account.chainId ?? null }),
        getChainTimestamp: async () => (await publicClient.getBlock()).timestamp,
        getBlockTimestamp: async (blockNumber) => (await publicClient.getBlock({ blockNumber })).timestamp,
        getRegistrationCommitmentState: async ({ controller, commitment }) => {
          const blockNumber = await publicClient.getBlockNumber();
          const [committedAt, consumed, block] = await Promise.all([
            publicClient.readContract({
              address: controller,
              abi: chainNameControllerV3Abi,
              functionName: "commitments",
              args: [commitment],
              blockNumber,
            }),
            publicClient.readContract({
              address: controller,
              abi: chainNameControllerV3Abi,
              functionName: "commitmentConsumed",
              args: [commitment],
              blockNumber,
            }),
            publicClient.getBlock({ blockNumber }),
          ]);
          return { committedAt, consumed, blockNumber, blockTimestamp: block.timestamp };
        },
      },
    });
  }, [account.address, account.chainId, client, publicClient, sendTransactionAsync]);

  useEffect(() => {
    if (!controller || !account.address) return;
    void controller.restore(account.address).catch(() => {
      // Recovery errors are exposed by the controller state and never converted to a completed registration.
    });
  }, [account.address, controller]);

  if (!isV3ManifestOperational()) {
    return (
      <NameHero label={label} status="NOT AVAILABLE" statusKind="unavailable">
        <p className={styles.message}>Registration is still being prepared. No wallet action has been requested.</p>
      </NameHero>
    );
  }
  if (currentLoad?.status === "error") return <NameHero label={label} status="READ ERROR"><p className={styles.message} role="alert">Availability and price could not be verified. Try again shortly.</p></NameHero>;
  if (!client || !record) return <NameHero label={label} status="VERIFYING"><p className={styles.message} role="status">Checking current availability and price onchain...</p></NameHero>;
  if (!record.available) {
    const connectedOwner = Boolean(account.address && record.owner?.toLowerCase() === account.address.toLowerCase());
    const expiration = safeExpiration(record.expiresAt);
    return (
      <NameHero label={record.label} status={record.reserved ? "RESERVED" : record.status.toUpperCase()} statusKind={record.reserved ? "unavailable" : "pending"}>
        <p className={styles.message}>
          This name is {record.reserved ? "reserved" : `currently ${record.status}`}.
        </p>
        <dl className={styles.recordGrid}>
          <div><dt>STATUS</dt><dd>{record.status.toUpperCase()}</dd></div>
          <div><dt>OWNER</dt><dd title={record.owner ?? undefined}>{record.owner ? shortenAddress(record.owner) : "NO CURRENT OWNER"}</dd></div>
          <div><dt>RESOLVES TO</dt><dd title={record.resolvedAddress ?? undefined}>{record.resolvedAddress ? shortenAddress(record.resolvedAddress) : "NOT SET"}</dd></div>
          <div><dt>EXPIRES</dt><dd>{expiration
            ? <time dateTime={expiration.toISOString()}>{expiration.toLocaleString()}</time>
            : "NOT APPLICABLE"}</dd></div>
        </dl>
        <div className={styles.textRecords}>
          <strong>PUBLIC PROFILE</strong>
          {textRecordsUnavailable ? (
            <p role="status">Text records could not be verified and are not being shown as empty.</p>
          ) : textRecords ? (
            <dl>
              {publicTextKeys.map((key) => (
                <div key={key}><dt>{publicTextLabels[key]}</dt><dd>{textRecords[key] || "NOT SET"}</dd></div>
              ))}
            </dl>
          ) : <p role="status">Loading public profile...</p>}
        </div>
        {connectedOwner ? <Link href="/me">Manage this name</Link> : null}
      </NameHero>
    );
  }
  const previewProps = {
    durationYears,
    fullName: record.fullName,
    onDurationYearsChange: setDurationYears,
    quoteAmount,
    quoteStatus,
  } as const;
  if (!account.address) {
    return (
      <NameHero label={record.label} status="AVAILABLE" statusKind="available">
        <V3RegistrationPreview {...previewProps} status="Connect your wallet to continue." action={<WalletButton />} />
      </NameHero>
    );
  }
  if (account.chainId !== v3BrowserManifest.chainId) {
    return (
      <NameHero label={record.label} status="AVAILABLE" statusKind="available">
        <V3RegistrationPreview
          {...previewProps}
          status={`Switch to ${v3BrowserManifest.chainName} to continue.`}
          action={(
            <button type="button" onClick={() => void chainSwitch.switchToConfiguredChain()} disabled={chainSwitch.isSwitching}>
              {chainSwitch.isSwitching ? "Switching..." : `Switch to ${v3BrowserManifest.chainName}`}
            </button>
          )}
        />
      </NameHero>
    );
  }
  if (!controller) return <NameHero label={record.label} status="AVAILABLE" statusKind="available"><p className={styles.message} role="status">Preparing registration...</p></NameHero>;

  return (
    <NameHero label={record.label} status="AVAILABLE" statusKind="available">
      <V3RegistrationPanel
        controller={controller}
        durationYears={durationYears}
        payer={account.address}
        recipient={account.address}
        initialization={{ addressRecord: account.address, textRecords: [] }}
        initialName={record.label}
        quoteAmount={quoteAmount}
        quoteStatus={quoteStatus}
        referrer={referral}
        onDurationYearsChange={setDurationYears}
        onClearReferral={() => {
          clearV3ReferralAttribution();
          setReferralDismissed(true);
        }}
        onReferralConsumed={() => {
          clearV3ReferralAttribution();
          setReferralDismissed(true);
        }}
        onExport={(serialized) => {
          const blob = new Blob([serialized], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${record.label}-sepbase-v3-registration-session.json`;
          anchor.click();
          URL.revokeObjectURL(url);
        }}
      />
    </NameHero>
  );
}
