"use client";

import type { ReactNode } from "react";
import { isV3ManifestOperational } from "@/lib/v3-browser-runtime";
import { V3MarketWorkspace } from "./v3-market-workspace";

export function V3MarketRoute({ fallback }: { fallback: ReactNode }) {
  if (!isV3ManifestOperational()) return fallback;
  return <V3MarketWorkspace />;
}
