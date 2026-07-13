"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { configuredChain } from "@/lib/chain";

type SharedSwitchResult = { ok: true; error: null } | { ok: false; error: Error };

let sharedSwitchInFlight: {
  connectorUid: string;
  operation: Promise<SharedSwitchResult>;
} | null = null;

function requestSharedConfiguredChainSwitch(
  connectorUid: string,
  switchChain: () => Promise<unknown>,
): Promise<SharedSwitchResult> {
  if (sharedSwitchInFlight) {
    if (sharedSwitchInFlight.connectorUid === connectorUid) {
      return sharedSwitchInFlight.operation;
    }
    return Promise.resolve({
      ok: false,
      error: new Error("ACTIVE_WALLET_CHANGED"),
    });
  }
  const operation = Promise.resolve()
    .then(switchChain)
    .then<SharedSwitchResult>(() => ({ ok: true, error: null }))
    .catch((error: unknown): SharedSwitchResult => ({
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
  sharedSwitchInFlight = { connectorUid, operation };
  void operation.then(() => {
    if (sharedSwitchInFlight?.operation === operation) sharedSwitchInFlight = null;
  });
  return operation;
}

export function useConfiguredChainSwitch(automatic = false) {
  const { chainId, connector } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const automaticAttemptedFor = useRef<string | null>(null);
  const localAttempt = useRef<Promise<boolean> | null>(null);
  const [isLocallySwitching, setIsLocallySwitching] = useState(false);
  const [switchError, setSwitchError] = useState<Error | null>(null);

  const switchToConfiguredChain = useCallback((): Promise<boolean> => {
    if (localAttempt.current) return localAttempt.current;
    if (!connector) {
      const missingConnector = new Error("ACTIVE_WALLET_NOT_AVAILABLE");
      setSwitchError(missingConnector);
      return Promise.resolve(false);
    }
    setSwitchError(null);
    setIsLocallySwitching(true);
    const attempt = requestSharedConfiguredChainSwitch(
      connector.uid,
      async () => {
        await switchChainAsync({ chainId: configuredChain.id, connector });
        const confirmedChainId = await connector.getChainId();
        if (confirmedChainId !== configuredChain.id) {
          throw new Error("CHAIN_SWITCH_NOT_CONFIRMED");
        }
      },
    )
      .then((result) => {
        setSwitchError(result.error);
        return result.ok;
      })
      .finally(() => {
        localAttempt.current = null;
        setIsLocallySwitching(false);
      });
    localAttempt.current = attempt;
    return attempt;
  }, [connector, switchChainAsync]);

  useEffect(() => {
    if (!automatic) {
      automaticAttemptedFor.current = null;
      return;
    }
    const connectorUid = connector?.uid ?? null;
    if (!connectorUid || automaticAttemptedFor.current === connectorUid) return;
    automaticAttemptedFor.current = connectorUid;
    void switchToConfiguredChain();
  }, [automatic, connector?.uid, switchToConfiguredChain]);

  return {
    error: chainId === configuredChain.id ? null : switchError,
    isSwitching: isPending || isLocallySwitching,
    switchToConfiguredChain,
  };
}
