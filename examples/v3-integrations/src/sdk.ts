import {
  createSepbaseV3Client,
  type SepbaseV3Client,
} from "@sepbase/sdk";
import type { Address } from "viem";

export async function connectVerifiedV3(manifestUrl: string, rpcUrl?: string) {
  const manifestOrigin = new URL(manifestUrl).origin;
  return createSepbaseV3Client({
    manifestUrl,
    allowedManifestOrigins: [manifestOrigin],
    ...(rpcUrl
      ? { rpcUrl, allowedRpcOrigins: [new URL(rpcUrl).origin] }
      : {}),
  });
}

export async function readCanonicalName(client: SepbaseV3Client, rawName: string) {
  const normalized = client.normalize(rawName);
  const record = await client.getNameRecord(normalized.normalizedLabel);
  return { normalized, record };
}

export async function prepareGuardedFixedPurchase(
  client: SepbaseV3Client,
  buyer: Address,
  tokenId: bigint,
  recipient: Address = buyer,
) {
  const plan = await client.prepareBuy({ buyer, tokenId, recipient });
  // The SDK returns calldata only. The wallet must simulate, display and sign it.
  return plan;
}
