import type { SepbaseV3Client } from "@sepbase/sdk";

export const V3_MARKET_MAX_VISIBLE_NAME_CONTEXTS = 150;
const V3_MARKET_NAME_CONTEXT_BATCH_SIZE = 50;

export type V3MarketNameLifecycle = "unregistered" | "active" | "grace" | "released";

export type V3MarketNameContext = {
  tokenId: bigint;
  label: string;
  fullName: string;
  lifecycle: V3MarketNameLifecycle;
  expiresAt: bigint;
  blockNumber: bigint;
};

export type V3MarketNameContextMap = Record<string, V3MarketNameContext>;

function uniqueTokenIds(tokenIds: readonly bigint[]) {
  const values = new Map<string, bigint>();
  for (const tokenId of tokenIds) values.set(tokenId.toString(), tokenId);
  return [...values.values()];
}

function lifecycle(value: unknown): V3MarketNameLifecycle {
  const statuses = ["unregistered", "active", "grace", "released"] as const;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("V3_MARKET_NAME_STATUS_INVALID");
  }
  const status = statuses[value];
  if (!status) throw new Error("V3_MARKET_NAME_STATUS_INVALID");
  return status;
}

function parseNameContext(
  tokenId: bigint,
  blockNumber: bigint,
  values: readonly unknown[],
): V3MarketNameContext {
  const [label, fullName, status, expiresAt] = values;
  if (typeof label !== "string" || label.length === 0 || typeof fullName !== "string" || fullName.length === 0) {
    throw new Error("V3_MARKET_NAME_CONTEXT_INVALID");
  }
  if (typeof expiresAt !== "bigint" || expiresAt <= 0n) {
    throw new Error("V3_MARKET_NAME_EXPIRY_INVALID");
  }

  return {
    tokenId,
    label,
    fullName,
    lifecycle: lifecycle(status),
    expiresAt,
    blockNumber,
  };
}

export async function readV3MarketNameContexts(
  client: SepbaseV3Client,
  tokenIds: readonly bigint[],
  blockNumber: bigint,
  limit = V3_MARKET_MAX_VISIBLE_NAME_CONTEXTS,
): Promise<V3MarketNameContextMap> {
  const unique = uniqueTokenIds(tokenIds);
  if (!Number.isSafeInteger(limit) || limit < 1 || unique.length > limit) {
    throw new Error("V3_MARKET_NAME_CONTEXT_LIMIT");
  }

  const contexts: V3MarketNameContext[] = [];
  for (let start = 0; start < unique.length; start += V3_MARKET_NAME_CONTEXT_BATCH_SIZE) {
    const batch = unique.slice(start, start + V3_MARKET_NAME_CONTEXT_BATCH_SIZE);
    const contracts = batch.flatMap((tokenId) => [
      {
        address: client.contracts.registry.address,
        abi: client.contracts.registry.abi,
        functionName: "labelOf" as const,
        args: [tokenId] as const,
      },
      {
        address: client.contracts.registry.address,
        abi: client.contracts.registry.abi,
        functionName: "fullName" as const,
        args: [tokenId] as const,
      },
      {
        address: client.contracts.registry.address,
        abi: client.contracts.registry.abi,
        functionName: "statusOf" as const,
        args: [tokenId] as const,
      },
      {
        address: client.contracts.registry.address,
        abi: client.contracts.registry.abi,
        functionName: "expiresAt" as const,
        args: [tokenId] as const,
      },
    ]);
    const results = await client.publicClient.multicall({
      allowFailure: false,
      blockNumber,
      contracts,
    });
    for (let index = 0; index < batch.length; index += 1) {
      const offset = index * 4;
      contexts.push(parseNameContext(
        batch[index]!,
        blockNumber,
        results.slice(offset, offset + 4),
      ));
    }
  }
  return Object.fromEntries(contexts.map((context) => [context.tokenId.toString(), context]));
}

export function requireV3MarketNameContext(
  contexts: V3MarketNameContextMap,
  tokenId: bigint,
) {
  const context = contexts[tokenId.toString()];
  if (!context) throw new Error("V3_MARKET_NAME_CONTEXT_MISSING");
  return context;
}
