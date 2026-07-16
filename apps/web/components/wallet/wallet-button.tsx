"use client";

import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import {
  useConnect,
  useConnection,
  useConnectors,
  useConnections,
  useDisconnect,
  useSwitchConnection,
} from "wagmi";
import { configuredChain } from "@/lib/chain";
import { shortenAddress } from "@/lib/formatting";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfiguredChainSwitch } from "./use-configured-chain-switch";
import styles from "./wallet.module.css";

type WalletOperation =
  | { kind: "connector"; connectorUid: string }
  | { kind: "disconnect" }
  | { kind: "network" }
  | null;

function walletRequestErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reject") || message.includes("denied")) {
    return "The wallet request was rejected. Retry when you are ready.";
  }
  return fallback;
}

export function WalletButton() {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<WalletOperation>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { address, chainId, connector: activeConnector, isConnected } = useConnection();
  const connectors = useConnectors();
  const connections = useConnections();
  const { mutateAsync: connectWallet, isPending: isConnecting } = useConnect();
  const { mutateAsync: disconnectWallet, isPending: isDisconnecting } = useDisconnect();
  const { mutateAsync: switchConnection, isPending: isSwitchingConnection } = useSwitchConnection();
  const { switchToConfiguredChain, isSwitching } = useConfiguredChainSwitch();

  const isConfiguredChain = chainId === configuredChain.id;
  const isBusy = Boolean(operation)
    || isConnecting
    || isDisconnecting
    || isSwitchingConnection
    || isSwitching;
  const hasDedicatedInjectedWallet = connectors.some(
    (connector) => connector.type === "injected" && Boolean(connector.rdns),
  );
  const visibleConnectors = hasDedicatedInjectedWallet
    ? connectors.filter((connector) => {
        const genericInjectedFallback = connector.type === "injected" && !connector.rdns;
        const alreadyConnected = connections.some(
          (connection) => connection.connector.uid === connector.uid,
        );
        return !genericInjectedFallback || alreadyConnected;
      })
    : connectors;

  function openWalletOptions() {
    setErrorMessage(null);
    setOpen(true);
  }

  function closeWalletOptions() {
    setErrorMessage(null);
    setOpen(false);
  }

  async function handleConfiguredChainSwitch() {
    setErrorMessage(null);
    setOperation({ kind: "network" });
    const switched = await switchToConfiguredChain();
    setOperation(null);
    if (switched) {
      setOpen(false);
      return;
    }
    setErrorMessage(
      `Could not switch this wallet to ${configuredChain.name}. You can retry or disconnect it below.`,
    );
  }

  async function handleConnector(connector: (typeof connectors)[number]) {
    setErrorMessage(null);

    if (connector.uid === activeConnector?.uid) {
      setOpen(false);
      return;
    }

    setOperation({ kind: "connector", connectorUid: connector.uid });
    try {
      const existingConnection = connections.find(
        (connection) => connection.connector.uid === connector.uid,
      );
      const result = existingConnection
        ? await switchConnection({ connector: existingConnection.connector })
        : await connectWallet({ connector, chainId: configuredChain.id });

      if (result.chainId !== configuredChain.id) {
        const switched = await switchToConfiguredChain();
        if (!switched) {
          setErrorMessage(
            `${connector.name} is selected, but it could not switch to ${configuredChain.name}. Retry the network switch above.`,
          );
          return;
        }
      }

      setOpen(false);
    } catch (error) {
      setErrorMessage(
        walletRequestErrorMessage(
          error,
          "This wallet could not be connected. Check the wallet extension and try again.",
        ),
      );
    } finally {
      setOperation(null);
    }
  }

  async function handleDisconnectAll() {
    setErrorMessage(null);
    setOperation({ kind: "disconnect" });
    const failures: unknown[] = [];

    if (connections.length === 0) {
      try {
        await disconnectWallet(undefined);
      } catch (error) {
        failures.push(error);
      }
    } else {
      for (const connection of [...connections]) {
        try {
          await disconnectWallet({ connector: connection.connector });
        } catch (error) {
          failures.push(error);
        }
      }
    }

    setOperation(null);
    if (failures.length === 0) {
      setOpen(false);
      return;
    }
    setErrorMessage(
      walletRequestErrorMessage(
        failures[0],
        "One or more wallet connections could not be cleared. Retry disconnect.",
      ),
    );
  }

  return (
    <>
      {isConnected ? (
        <button
          className={styles.accountButton}
          onClick={openWalletOptions}
          title="Wallet options"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span
            className={`${styles.accountDot} ${isConfiguredChain ? "" : styles.accountDotWarning}`}
          />
          <span>
            {isConfiguredChain && address
              ? shortenAddress(address)
              : `Switch to ${configuredChain.name}`}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : (
        <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={openWalletOptions}>
          Connect
        </Button>
      )}

      <Dialog
        open={open}
        onClose={closeWalletOptions}
        eyebrow="WALLET"
        title={isConnected ? "Wallet options" : "Connect a wallet"}
        description={
          isConnected
            ? "Switch the active wallet, change network, or disconnect."
            : `Choose a wallet configured for ${configuredChain.name}.`
        }
      >
        {isConnected && address ? (
          <div className={styles.accountSummary}>
            <div>
              <span className={styles.accountLabel}>CONNECTED ACCOUNT</span>
              <strong>{shortenAddress(address)}</strong>
            </div>
            <span className={isConfiguredChain ? styles.networkReady : styles.networkWarning}>
              {isConfiguredChain ? configuredChain.name : "Wrong network"}
            </span>
          </div>
        ) : null}

        {isConnected && !isConfiguredChain ? (
          <Button
            variant="secondary"
            className={styles.fullWidthAction}
            onClick={() => void handleConfiguredChainSwitch()}
            disabled={isBusy}
          >
            {operation?.kind === "network"
              ? "Switching..."
              : `Switch to ${configuredChain.name}`}
          </Button>
        ) : null}

        <div className={styles.walletSectionHeading}>
          <span>{isConnected ? "Switch wallet" : "Choose wallet"}</span>
          {connections.length > 1 ? <span>{connections.length} connected</span> : null}
        </div>

        {visibleConnectors.length > 0 ? (
          <div className={styles.connectorList}>
            {visibleConnectors.map((connector) => {
              const connected = connections.some(
                (connection) => connection.connector.uid === connector.uid,
              );
              const active = connector.uid === activeConnector?.uid;
              const pending = operation?.kind === "connector"
                && operation.connectorUid === connector.uid;
              const action = pending
                ? "WAIT"
                : active
                  ? "ACTIVE"
                  : connected
                    ? "SWITCH"
                    : "CONNECT";

              return (
                <button
                  key={connector.uid}
                  className={styles.connector}
                  disabled={isBusy || active}
                  onClick={() => void handleConnector(connector)}
                >
                  <Wallet size={20} aria-hidden="true" />
                  <span>{connector.name}</span>
                  <span className={styles.connectorAction}>{action}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyWallets}>
            No browser wallet was found. Install or enable a compatible wallet and retry.
          </p>
        )}

        {errorMessage ? (
          <p className={styles.walletError} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {isConnected ? (
          <div className={styles.walletFooter}>
            <Button
              variant="quiet"
              icon={<LogOut size={18} aria-hidden="true" />}
              className={styles.disconnectButton}
              onClick={() => void handleDisconnectAll()}
              disabled={isBusy}
            >
              {operation?.kind === "disconnect"
                ? "Disconnecting..."
                : connections.length > 1
                  ? "Disconnect all wallets"
                  : "Disconnect wallet"}
            </Button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
