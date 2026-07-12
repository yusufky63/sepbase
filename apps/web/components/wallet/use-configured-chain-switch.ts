"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSwitchChain } from "wagmi";
import { configuredChain } from "@/lib/chain";

export function useConfiguredChainSwitch(automatic = false) {
  const { switchChainAsync, isPending, error } = useSwitchChain();
  const automaticAttempted = useRef(false);

  const switchToConfiguredChain = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: configuredChain.id });
      return true;
    } catch {
      return false;
    }
  }, [switchChainAsync]);

  useEffect(() => {
    if (!automatic) {
      automaticAttempted.current = false;
      return;
    }
    if (automaticAttempted.current) return;
    automaticAttempted.current = true;
    void switchToConfiguredChain();
  }, [automatic, switchToConfiguredChain]);

  return {
    error,
    isSwitching: isPending,
    switchToConfiguredChain,
  };
}
