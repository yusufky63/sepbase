"use client";

import { LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount, useConnect, useConnections, useDisconnect } from "wagmi";
import { configuredChain } from "@/lib/chain";
import { shortenAddress } from "@/lib/formatting";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfiguredChainSwitch } from "./use-configured-chain-switch";
import styles from "./wallet.module.css";

export function WalletButton() {
  const [open, setOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { address, chainId, connector, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const connections = useConnections();
  const { disconnectAsync } = useDisconnect();
  const { error, switchToConfiguredChain, isSwitching } = useConfiguredChainSwitch();
  const hasNamedInjectedConnector = connectors.some(
    (candidate) => candidate.type === "injected" && candidate.id !== "injected",
  );
  const visibleConnectors = connectors.filter(
    (candidate) => candidate.id !== "injected" || !hasNamedInjectedConnector,
  );

  async function disconnectAllWallets() {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    const targets = connections.length > 0
      ? connections.map((connection) => connection.connector)
      : connector
        ? [connector]
        : [];
    for (const target of targets) {
      try {
        await disconnectAsync({ connector: target });
      } catch {
        // Keep clearing any other dApp connections even if one provider is unavailable.
      }
    }
    setOpen(false);
    setIsDisconnecting(false);
  }

  const disconnectLabel = connections.length > 1
    ? `Disconnect all ${connections.length} wallets`
    : `Disconnect wallet ${address ? shortenAddress(address) : ""}`.trim();
  const connectedWalletNames = Array.from(new Set(
    connections.map((connection) => connection.connector.name),
  )).join(" + ");

  if (isConnected && address) {
    if (connections.length > 1) {
      return (
        <div className={styles.wrongNetworkActions} aria-label="Wallet connection conflict">
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={() => void disconnectAllWallets()}
            disabled={isDisconnecting}
            aria-label={disconnectLabel}
            title={disconnectLabel}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Disconnect all</span>
          </button>
          <span className={styles.networkError} role="alert">
            {connectedWalletNames || `${connections.length} wallets`} are connected to this dApp. Disconnect all, then reconnect only one wallet before switching networks or signing.
          </span>
        </div>
      );
    }
    if (chainId !== configuredChain.id) {
      return (
        <div className={styles.wrongNetworkActions} aria-label="Wallet network actions">
          <Button
            variant="secondary"
            onClick={() => void switchToConfiguredChain()}
            disabled={isSwitching || isDisconnecting}
            aria-describedby={error ? "wallet-network-switch-error" : undefined}
            title={`${connector?.name ?? "Active wallet"}: switch to ${configuredChain.name}`}
          >
            {isSwitching
              ? "Switching..."
              : error
                ? `Retry ${configuredChain.name}`
                : `Switch to ${configuredChain.name}`}
          </Button>
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={() => void disconnectAllWallets()}
            disabled={isDisconnecting}
            aria-label={disconnectLabel}
            title={disconnectLabel}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Disconnect</span>
          </button>
          {error ? (
            <span id="wallet-network-switch-error" className={styles.networkError} role="alert">
              {connector?.name ?? "The active wallet"} did not confirm the network switch. Close any pending wallet request, or disconnect all wallets and reconnect one.
            </span>
          ) : null}
        </div>
      );
    }
    return (
      <button
        className={styles.accountButton}
        onClick={() => void disconnectAllWallets()}
        disabled={isDisconnecting}
        aria-label={disconnectLabel}
        title={disconnectLabel}
      >
        <span className={styles.accountDot} />
        <span>{shortenAddress(address)}</span>
        <LogOut size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <>
      <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={() => setOpen(true)}>
        Connect
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Connect a wallet"
        description={`Choose a wallet configured for ${configuredChain.name}.`}
      >
        <div className={styles.connectorList}>
          {visibleConnectors.map((connector) => (
            <button
              key={connector.uid}
              className={styles.connector}
              disabled={isPending}
              onClick={() => connect({ connector })}
            >
              <Wallet size={20} aria-hidden="true" />
              <span>{connector.name}</span>
              <span className={styles.connectorAction}>CONNECT</span>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
