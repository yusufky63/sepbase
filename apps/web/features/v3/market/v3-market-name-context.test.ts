import { describe, expect, it, vi } from "vitest";
import type { SepbaseV3Client } from "@sepbase/sdk";
import { parseAbi, type Address } from "viem";
import {
  readV3MarketNameContexts,
  requireV3MarketNameContext,
} from "./v3-market-name-context";

const registry = "0x1111111111111111111111111111111111111111" as Address;
const registryAbi = parseAbi([
  "function labelOf(uint256 tokenId) view returns (string)",
  "function fullName(uint256 tokenId) view returns (string)",
  "function statusOf(uint256 tokenId) view returns (uint8)",
  "function expiresAt(uint256 tokenId) view returns (uint64)",
]);

function clientFixture(readContract: (input: { functionName: string; blockNumber?: bigint }) => Promise<unknown>) {
  const multicall = vi.fn(async ({
    contracts,
    blockNumber,
  }: {
    contracts: readonly { functionName: string }[];
    blockNumber?: bigint;
  }) => Promise.all(contracts.map(({ functionName }) => readContract({
    functionName,
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }))));
  return {
    contracts: { registry: { address: registry, abi: registryAbi } },
    publicClient: { multicall },
  } as unknown as SepbaseV3Client;
}

describe("V3 market name context", () => {
  it("deduplicates bounded token reads and resolves name, lifecycle and expiry at one pinned block", async () => {
    const client = clientFixture(async ({ functionName, blockNumber }) => {
      expect(blockNumber).toBe(900n);
      if (functionName === "labelOf") return "alice";
      if (functionName === "fullName") return "alice.base";
      if (functionName === "statusOf") return 1;
      if (functionName === "expiresAt") return 2_000_000_000n;
      throw new Error(`Unexpected read: ${functionName}`);
    });

    const contexts = await readV3MarketNameContexts(client, [42n, 42n], 900n, 1);
    expect(requireV3MarketNameContext(contexts, 42n)).toEqual({
      tokenId: 42n,
      label: "alice",
      fullName: "alice.base",
      lifecycle: "active",
      expiresAt: 2_000_000_000n,
      blockNumber: 900n,
    });
    expect(client.publicClient.multicall).toHaveBeenCalledTimes(1);
  });

  it("fails closed when any pinned name-context read fails or the bound is exceeded", async () => {
    const client = clientFixture(async ({ functionName }) => {
      if (functionName === "labelOf") throw new Error("RPC unavailable");
      return "unused";
    });

    await expect(readV3MarketNameContexts(client, [42n], 900n, 1)).rejects.toThrow("RPC unavailable");
    await expect(readV3MarketNameContexts(client, [1n, 2n], 900n, 1)).rejects.toThrow(
      "V3_MARKET_NAME_CONTEXT_LIMIT",
    );
  });
});
