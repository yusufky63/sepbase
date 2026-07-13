"use client";

import { chainNameRegistryV3Abi } from "@sepbase/sdk";
import type { Address } from "viem";
import { useReadContract } from "wagmi";

export function V3Lifecycle({ registry, tokenId }: { registry: Address; tokenId: bigint }) {
  const query = useReadContract({
    address: registry,
    abi: chainNameRegistryV3Abi,
    functionName: "statusOf",
    args: [tokenId],
  });

  if (query.isPending) return <span role="status">Loading lifecycle…</span>;
  if (query.isError) return <span role="alert">Lifecycle unavailable.</span>;
  return <span>Lifecycle enum: {String(query.data)}</span>;
}
