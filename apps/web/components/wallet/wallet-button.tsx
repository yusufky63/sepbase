"use client";

import { LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { configuredChain } from "@/lib/chain";
import { shortenAddress } from "@/lib/formatting";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfiguredChainSwitch } from "./use-configured-chain-switch";
import styles from "./wallet.module.css";

export function WalletButton() {
  const [open, setOpen] = useState(false);
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchToConfiguredChain, isSwitching } = useConfiguredChainSwitch();

  if (isConnected && address) {
    if (chainId !== configuredChain.id) {
      return (
        <Button
          variant="secondary"
          onClick={() => void switchToConfiguredChain()}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching..." : `Switch to ${configuredChain.name}`}
        </Button>
      );
    }
    return (
      <button className={styles.accountButton} onClick={() => disconnect()} title="Disconnect wallet">
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
          {connectors.map((connector) => (
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
