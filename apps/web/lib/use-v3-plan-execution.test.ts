import { describe, expect, it, vi } from "vitest";
import type { Address, Hash, Hex, PublicClient } from "viem";
import { createV3WagmiAdapter } from "./use-v3-plan-execution";

const account = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const hash = `0x${"33".repeat(32)}` as Hash;

describe("V3 wagmi execution adapter", () => {
  it("uses exact allowance, raw call simulation, wallet send and requested confirmations", async () => {
    const readContract = vi.fn(async () => 500n);
    const call = vi.fn(async () => ({ data: "0x" as Hex }));
    const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const, blockNumber: 120n }));
    const sendTransaction = vi.fn(async () => hash);
    const adapter = createV3WagmiAdapter({
      account,
      chainId: 84_532,
      publicClient: { readContract, call, waitForTransactionReceipt } as unknown as PublicClient,
      sendTransaction,
    });
    await expect(adapter.readAllowance({ token: target, owner: account, spender: target })).resolves.toBe(500n);
    const transaction = { account, to: target, data: "0x1234" as Hex, value: 0n, chainId: 84_532 };
    await adapter.simulate(transaction);
    await expect(adapter.send(transaction)).resolves.toBe(hash);
    await expect(adapter.waitForReceipt({ hash, confirmations: 3 })).resolves.toEqual({ status: "success", blockNumber: 120n });
    expect(call).toHaveBeenCalledWith({ account, to: target, data: "0x1234", value: 0n });
    expect(sendTransaction).toHaveBeenCalledWith(transaction);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash, confirmations: 3 });
  });
});
