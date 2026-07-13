"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import type { SepbaseV3Client, V3NameRecord } from "@sepbase/sdk";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useConfiguredChainSwitch } from "@/components/wallet/use-configured-chain-switch";
import { createV3RegistrationFlowController } from "@/lib/v3-registration-flow";
import { getV3BrowserClient, isV3ManifestOperational, v3BrowserManifest } from "@/lib/v3-browser-runtime";
import { chainNameControllerV3Abi } from "@/lib/contract/v3-abi.generated";
import { clearV3ReferralAttribution, readV3ReferralAttribution } from "@/lib/referrals";
import { createV3WagmiAdapter } from "@/lib/use-v3-plan-execution";
import { V3RegistrationPanel } from "./v3-registration-panel";
import styles from "./v3-registration-workspace.module.css";

const publicTextKeys = ["avatar", "url", "com.twitter", "com.github"] as const;

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

function safeExpiration(value: bigint | null) {
  if (value === null || value < 0n || value > 8_640_000_000_000n) return null;
  const date = new Date(Number(value) * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function V3RegistrationWorkspace({ label }: { label: string }) {
  const account = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const chainSwitch = useConfiguredChainSwitch();
  const [storedLoad, setStoredLoad] = useState<V3NameLoadState | null>(null);
  const [referralDismissed, setReferralDismissed] = useState(false);
  const loadKey = `${v3BrowserManifest.suiteReleaseId}:${label}`;
  const currentLoad = storedLoad?.key === loadKey ? storedLoad : null;
  const client = currentLoad?.status === "ready" ? currentLoad.client : null;
  const record = currentLoad?.status === "ready" ? currentLoad.record : null;
  const textRecords = currentLoad?.status === "ready" ? currentLoad.textRecords : null;
  const textRecordsUnavailable = currentLoad?.status === "ready" && currentLoad.textRecordsUnavailable;
  const referral = referralDismissed ? null : readV3ReferralAttribution();

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
      <section className={styles.boundary}>
        <span>V3 REGISTRATION / DRAFT</span>
        <h2>Commit-reveal is source-ready, not deployed.</h2>
        <p>All seven V3 addresses must be verified and the manifest promoted before this wallet flow can request an attestation or transaction.</p>
      </section>
    );
  }
  if (currentLoad?.status === "error") return <section className={styles.boundary} role="alert"><h2>V3 name state is unavailable.</h2><p>No availability or price assumption has been made.</p></section>;
  if (!client || !record) return <section className={styles.boundary} role="status"><h2>Verifying V3 release and name state...</h2></section>;
  if (!record.available) {
    const connectedOwner = Boolean(account.address && record.owner?.toLowerCase() === account.address.toLowerCase());
    const expiration = safeExpiration(record.expiresAt);
    return (
      <section className={`${styles.boundary} ${styles.record}`}>
        <span>V3 NAME / BLOCK {record.blockNumber.toString()}</span>
        <h1>{record.fullName}</h1>
        <p>
          This name is {record.reserved ? "reserved by protocol policy" : `currently ${record.status}`}.
          Public values below are pinned to one verified block.
        </p>
        <dl className={styles.recordGrid}>
          <div><dt>STATUS</dt><dd>{record.status.toUpperCase()}</dd></div>
          <div><dt>OWNER</dt><dd><code>{record.owner ?? "NO CURRENT OWNER"}</code></dd></div>
          <div><dt>ADDRESS</dt><dd><code>{record.resolvedAddress ?? "NOT SET"}</code></dd></div>
          <div><dt>EXPIRES</dt><dd>{expiration
            ? <time dateTime={expiration.toISOString()}>{expiration.toLocaleString()}</time>
            : "NOT APPLICABLE"}</dd></div>
          <div><dt>TOKEN ID</dt><dd><code>{record.tokenId.toString()}</code></dd></div>
          <div><dt>TRANSFER NONCE</dt><dd><code>{record.transferNonce.toString()}</code></dd></div>
        </dl>
        <div className={styles.textRecords}>
          <strong>PUBLIC TEXT RECORDS</strong>
          {textRecordsUnavailable ? (
            <p role="status">Text records could not be verified and are not being shown as empty.</p>
          ) : textRecords ? (
            <dl>
              {publicTextKeys.map((key) => (
                <div key={key}><dt>{key}</dt><dd>{textRecords[key] || "NOT SET"}</dd></div>
              ))}
            </dl>
          ) : <p role="status">Reading text records at block {record.blockNumber.toString()}...</p>}
        </div>
        {connectedOwner ? <Link href="/me">Manage this name</Link> : null}
      </section>
    );
  }
  if (!account.address) {
    return <section className={styles.boundary}><h2>Connect the registering wallet.</h2><WalletButton /></section>;
  }
  if (account.chainId !== v3BrowserManifest.chainId) {
    return (
      <section className={styles.boundary}>
        <h2>Switch to {v3BrowserManifest.chainName}.</h2>
        <button type="button" onClick={() => void chainSwitch.switchToConfiguredChain()} disabled={chainSwitch.isSwitching}>
          {chainSwitch.isSwitching ? "Switching..." : "Switch network"}
        </button>
      </section>
    );
  }
  if (!controller) return <section className={styles.boundary} role="status"><h2>Preparing the verified wallet boundary...</h2></section>;

  return (
    <V3RegistrationPanel
      controller={controller}
      payer={account.address}
      recipient={account.address}
      initialization={{ addressRecord: account.address, textRecords: [] }}
      initialName={label}
      referrer={referral}
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
  );
}
