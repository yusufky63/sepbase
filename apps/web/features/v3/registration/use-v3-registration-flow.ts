"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { V3RegistrationFlowController } from "@/lib/v3-registration-flow";

export function useV3RegistrationFlow(controller: V3RegistrationFlowController) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    if (!state.session || state.stage === "complete") return;
    const timer = window.setInterval(() => void controller.tick(), 1_000);
    return () => window.clearInterval(timer);
  }, [controller, state.session, state.stage]);

  return state;
}
