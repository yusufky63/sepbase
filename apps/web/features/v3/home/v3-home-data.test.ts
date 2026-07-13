import type { SepbaseV3Client, V3NameRecord, V3SuiteManifest } from "@sepbase/sdk";
import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { v3BrowserManifest } from "@/lib/v3-browser-runtime";
import {
  getV3HomeConfirmedBlock,
  readV3HomeHealth,
  readV3HomeRecentNames,
} from "./v3-home-data";

const registry = "0x1111111111111111111111111111111111111111" as Address;
const controller = "0x2222222222222222222222222222222222222222" as Address;
const marketplace = "0x3333333333333333333333333333333333333333" as Address;

function manifest(): V3SuiteManifest {
  const value = structuredClone(v3BrowserManifest);
  value.releaseStatus = "candidate";
  value.requiredConfirmations = 5;
  value.multicall3.blockCreated = 1;
  value.deployment.blockNumber = "100";
  return value;
}

function client(input: {
  latestBlock?: bigint;
  readContract?: ReturnType<typeof vi.fn>;
  getLogs?: ReturnType<typeof vi.fn>;
  getNameRecord?: ReturnType<typeof vi.fn>;
}) {
  return {
    manifest: manifest(),
    contracts: {
      registry: { address: registry, abi: [] },
      controller: { address: controller, abi: [] },
      marketplace: { address: marketplace, abi: [] },
    },
    publicClient: {
      getBlockNumber: vi.fn(async () => input.latestBlock ?? 120n),
      readContract: input.readContract ?? vi.fn(),
      getLogs: input.getLogs ?? vi.fn(async () => []),
    },
    getNameRecord: input.getNameRecord ?? vi.fn(),
    getLiabilities: vi.fn(async (blockNumber: bigint) => ({
      controllerProtectedBalance: 0n,
      referralLiability: 0n,
      marketplaceProtectedBalance: 0n,
      claimableLiability: 0n,
      offerEscrow: 0n,
      auctionEscrow: 0n,
      suiteProtectedBalance: 0n,
      suiteSettlementBalance: 0n,
      controllerSolvent: true,
      marketplaceSolvent: true,
      suiteSolvent: true,
      blockNumber,
    })),
  } as unknown as SepbaseV3Client;
}

describe("V3 home reads", () => {
  it("pins all health reads below the required confirmation depth", async () => {
    const readBlocks: bigint[] = [];
    const readContract = vi.fn(async (request: { functionName: string; blockNumber: bigint }) => {
      readBlocks.push(request.blockNumber);
      if (request.functionName === "totalSupply") return 7n;
      if (request.functionName === "registrationsPaused") return false;
      if (request.functionName === "marketPaused") return true;
      throw new Error("unexpected read");
    });
    const sdk = client({ latestBlock: 120n, readContract });

    const blockNumber = await getV3HomeConfirmedBlock(sdk);
    const health = await readV3HomeHealth(sdk, blockNumber);

    expect(blockNumber).toBe(116n);
    expect(readBlocks).toEqual([116n, 116n, 116n]);
    expect(health).toEqual({
      blockNumber: 116n,
      nameCount: 7n,
      registrationsPaused: false,
      marketPaused: true,
      suiteSolvent: true,
    });
  });

  it("bounds the event window, deduplicates tokens and rechecks current state", async () => {
    const getLogs = vi.fn(async (request: { toBlock: bigint }) => request.toBlock === 20_000n ? [
      { args: { tokenId: 1n }, blockNumber: 19_000n },
      { args: { tokenId: 2n }, blockNumber: 19_500n },
      { args: { tokenId: 1n }, blockNumber: 19_900n },
    ] : []);
    const readContract = vi.fn(async (request: { functionName: string; args?: readonly unknown[] }) => {
      if (request.functionName !== "labelOf") throw new Error("unexpected read");
      return request.args?.[0] === 1n ? "alice" : "released";
    });
    const owner = "0x4444444444444444444444444444444444444444" as Address;
    const getNameRecord = vi.fn(async (label: string, blockNumber: bigint): Promise<V3NameRecord> => ({
      label,
      fullName: `${label}.sepbase`,
      node: `0x${"11".repeat(32)}`,
      tokenId: label === "alice" ? 1n : 2n,
      status: label === "alice" ? "active" : "released",
      owner,
      resolvedAddress: null,
      expiresAt: 2_000_000_000n,
      available: false,
      reserved: false,
      transferNonce: 1n,
      blockNumber,
    }));
    const sdk = client({ latestBlock: 20_004n, getLogs, readContract, getNameRecord });

    const blockNumber = await getV3HomeConfirmedBlock(sdk);
    const result = await readV3HomeRecentNames(sdk, blockNumber);

    expect(blockNumber).toBe(20_000n);
    expect(getLogs).toHaveBeenCalledTimes(5);
    expect(getLogs).toHaveBeenNthCalledWith(1, expect.objectContaining({
      address: controller,
      fromBlock: 10_001n,
      toBlock: 12_000n,
    }));
    expect(getLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      address: controller,
      fromBlock: 18_001n,
      toBlock: 20_000n,
    }));
    expect(getNameRecord).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([{
      tokenId: 1n,
      label: "alice",
      fullName: "alice.sepbase",
      owner,
      registrationBlock: 19_900n,
    }]);
  });
});
