import { describe, expect, it, vi } from "vitest";
import type { Address, Hash, Hex } from "viem";
import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";
import { executeV3Plan, type V3PlanExecutionAdapter } from "./v3-plan-executor";

const account = "0x1111111111111111111111111111111111111111" as Address;
const controller = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const hash = `0x${"44".repeat(32)}` as Hash;
const approvalHash = `0x${"55".repeat(32)}` as Hash;

function plan(approval = false): V3TransactionPlan {
  return {
    suiteReleaseId: `sha256:${"a".repeat(64)}`,
    chainId: 84_532,
    expectedSender: account,
    to: controller,
    data: "0x1234" as Hex,
    value: approval ? 0n : 500n,
    functionName: "register",
    blockNumber: 100n,
    settlementApproval: approval ? {
      token,
      spender: controller,
      amount: 500n,
      data: "0xabcd" as Hex,
    } : null,
  };
}

function fixture(options: { allowance?: bigint; approvalStatus?: "success" | "reverted" } = {}) {
  let allowance = options.allowance ?? 1_000n;
  const client = {
    manifest: { requiredConfirmations: 3 },
    assertTransactionPlan: vi.fn(),
    reconcileTransaction: vi.fn(async () => ({ hash, blockNumber: 120n, status: "success" as const })),
  } as unknown as SepbaseV3Client;
  const send = vi.fn(async (transaction: { to: Address }) => transaction.to === token ? approvalHash : hash);
  const adapter: V3PlanExecutionAdapter = {
    account,
    chainId: 84_532,
    readAllowance: vi.fn(async () => allowance),
    simulate: vi.fn(async () => undefined),
    send,
    waitForReceipt: vi.fn(async () => {
      if (options.approvalStatus !== "reverted") allowance = 500n;
      return { status: options.approvalStatus ?? "success", blockNumber: 110n };
    }),
  };
  return { client, adapter, send };
}

describe("V3 plan executor", () => {
  it("simulates, sends and reconciles a native plan before reporting confirmation", async () => {
    const { client, adapter, send } = fixture();
    const stages: string[] = [];
    await expect(executeV3Plan({
      client,
      adapter,
      prepare: async () => plan(false),
      onStage: (stage) => stages.push(stage),
    })).resolves.toMatchObject({ hash, approvalHash: null, blockNumber: 120n });
    expect(send).toHaveBeenCalledOnce();
    expect(client.reconcileTransaction).toHaveBeenCalledOnce();
    expect(stages).toEqual(["preparing", "simulating", "signing", "confirming", "confirmed"]);
  });

  it("persists the submission hash before receipt reconciliation and fails closed if that callback fails", async () => {
    const successful = fixture();
    const order: string[] = [];
    successful.client.reconcileTransaction = vi.fn(async () => {
      order.push("reconcile");
      return { hash, blockNumber: 120n, status: "success" as const };
    });
    await executeV3Plan({
      client: successful.client,
      adapter: successful.adapter,
      prepare: async () => plan(false),
      onSubmitted: async (submittedHash) => {
        expect(submittedHash).toBe(hash);
        order.push("journal");
      },
    });
    expect(order).toEqual(["journal", "reconcile"]);

    const failed = fixture();
    await expect(executeV3Plan({
      client: failed.client,
      adapter: failed.adapter,
      prepare: async () => plan(false),
      onSubmitted: () => { throw new Error("JOURNAL_WRITE_FAILED"); },
    })).rejects.toThrow("JOURNAL_WRITE_FAILED");
    expect(failed.send).toHaveBeenCalledOnce();
    expect(failed.client.reconcileTransaction).not.toHaveBeenCalled();
  });

  it("confirms an exact ERC-20 approval and refreshes every economic guard", async () => {
    const { client, adapter, send } = fixture({ allowance: 0n });
    const prepare = vi.fn(async () => plan(true));
    await expect(executeV3Plan({ client, adapter, prepare })).resolves.toMatchObject({ approvalHash });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(adapter.waitForReceipt).toHaveBeenCalledWith({ hash: approvalHash, confirmations: 3 });
  });

  it("rejects the wrong wallet or chain before simulation", async () => {
    const wrongAccount = fixture();
    wrongAccount.adapter.account = "0x9999999999999999999999999999999999999999";
    await expect(executeV3Plan({ client: wrongAccount.client, adapter: wrongAccount.adapter, prepare: async () => plan() }))
      .rejects.toThrow("V3_WRONG_ACCOUNT");
    expect(wrongAccount.adapter.simulate).not.toHaveBeenCalled();

    const wrongChain = fixture();
    wrongChain.adapter.chainId = 1;
    await expect(executeV3Plan({ client: wrongChain.client, adapter: wrongChain.adapter, prepare: async () => plan() }))
      .rejects.toThrow("V3_WRONG_CHAIN");
    expect(wrongChain.adapter.simulate).not.toHaveBeenCalled();
  });

  it("does not submit the main transaction when approval reverts", async () => {
    const { client, adapter, send } = fixture({ allowance: 0n, approvalStatus: "reverted" });
    await expect(executeV3Plan({ client, adapter, prepare: async () => plan(true) }))
      .rejects.toThrow("V3_APPROVAL_REVERTED");
    expect(send).toHaveBeenCalledOnce();
    expect(client.reconcileTransaction).not.toHaveBeenCalled();
  });

  it("requires a new user review if the refreshed payment plan changes", async () => {
    const { client, adapter, send } = fixture({ allowance: 0n });
    const changed = plan(true);
    changed.settlementApproval = { ...changed.settlementApproval!, amount: 600n };
    const prepare = vi.fn()
      .mockResolvedValueOnce(plan(true))
      .mockResolvedValueOnce(changed);
    await expect(executeV3Plan({ client, adapter, prepare })).rejects.toThrow("V3_PLAN_CHANGED_AFTER_APPROVAL");
    expect(send).toHaveBeenCalledOnce();
    expect(client.reconcileTransaction).not.toHaveBeenCalled();
  });

  it("requires a new review when guarded calldata changes after approval", async () => {
    const { client, adapter, send } = fixture({ allowance: 0n });
    const changed = { ...plan(true), data: "0x9999" as Hex, blockNumber: 101n };
    const prepare = vi.fn()
      .mockResolvedValueOnce(plan(true))
      .mockResolvedValueOnce(changed);
    await expect(executeV3Plan({ client, adapter, prepare })).rejects.toThrow("V3_PLAN_CHANGED_AFTER_APPROVAL");
    expect(send).toHaveBeenCalledOnce();
    expect(client.reconcileTransaction).not.toHaveBeenCalled();
  });
});
