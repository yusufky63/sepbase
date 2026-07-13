import {
  chainNameRegistryV3Abi,
  type V3SuiteManifest,
} from "@sepbase/sdk";
import type { PublicClient } from "viem";

export async function readPinnedLifecycle(
  publicClient: PublicClient,
  manifest: V3SuiteManifest,
  tokenId: bigint,
) {
  const registry = manifest.contracts.registry.address;
  if (!registry || manifest.releaseStatus === "draft") {
    throw new Error("A candidate/live V3 registry is required.");
  }
  const blockNumber = await publicClient.getBlockNumber();
  const status = await publicClient.readContract({
    address: registry,
    abi: chainNameRegistryV3Abi,
    functionName: "statusOf",
    args: [tokenId],
    blockNumber,
  });
  return { status, blockNumber, suiteReleaseId: manifest.suiteReleaseId };
}
