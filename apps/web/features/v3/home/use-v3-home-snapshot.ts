"use client";

import { useQuery } from "@tanstack/react-query";
import { getV3BrowserClient, v3BrowserManifest } from "@/lib/v3-browser-runtime";
import {
  getV3HomeConfirmedBlock,
  readV3HomeHealth,
  readV3HomeRecentNames,
  type V3HomeHealth,
  type V3HomeRecentNames,
} from "./v3-home-data";

type SnapshotPart<T> =
  | { status: "ready"; value: T }
  | { status: "unavailable" };

export type V3HomeSnapshot = {
  blockNumber: bigint;
  health: SnapshotPart<V3HomeHealth>;
  recent: SnapshotPart<V3HomeRecentNames>;
};

async function loadV3HomeSnapshot(): Promise<V3HomeSnapshot> {
  const client = await getV3BrowserClient();
  const blockNumber = await getV3HomeConfirmedBlock(client);
  const [health, recent] = await Promise.allSettled([
    readV3HomeHealth(client, blockNumber),
    readV3HomeRecentNames(client, blockNumber),
  ]);
  return {
    blockNumber,
    health: health.status === "fulfilled"
      ? { status: "ready", value: health.value }
      : { status: "unavailable" },
    recent: recent.status === "fulfilled"
      ? { status: "ready", value: recent.value }
      : { status: "unavailable" },
  };
}

export function useV3HomeSnapshot() {
  return useQuery({
    queryKey: ["v3", "home", v3BrowserManifest.suiteReleaseId],
    queryFn: loadV3HomeSnapshot,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
