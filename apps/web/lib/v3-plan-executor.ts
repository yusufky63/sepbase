import type { Address, Hash, Hex } from "viem";
import type { SepbaseV3Client, V3TransactionPlan } from "@sepbase/sdk";

export type V3ExecutionStage =
  | "preparing"
  | "approval-check"
  | "approval-simulating"
  | "approval-signing"
  | "approval-confirming"
  | "refreshing"
  | "simulating"
  | "signing"
  | "confirming"
  | "confirmed"
  | "error";

export type V3RawTransaction = {
  account: Address;
  to: Address;
  data: Hex;
  value: bigint;
  chainId: number;
};

export type V3PlanExecutionAdapter = {
  account: Address;
  chainId: number;
  readAllowance(input: { token: Address; owner: Address; spender: Address }): Promise<bigint>;
  simulate(transaction: V3RawTransaction): Promise<void>;
  send(transaction: V3RawTransaction): Promise<Hash>;
  waitForReceipt(input: { hash: Hash; confirmations: number }): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
};

export type V3PlanExecutionResult = {
  hash: Hash;
  blockNumber: bigint;
  approvalHash: Hash | null;
  plan: V3TransactionPlan;
};

function rawTransaction(plan: V3TransactionPlan): V3RawTransaction {
  return {
    account: plan.expectedSender,
    to: plan.to,
    data: plan.data,
    value: plan.value,
    chainId: plan.chainId,
  };
}

function sameApproval(
  left: V3TransactionPlan["settlementApproval"],
  right: V3TransactionPlan["settlementApproval"],
) {
  if (!left || !right) return left === right;
  return left.token.toLowerCase() === right.token.toLowerCase()
    && left.spender.toLowerCase() === right.spender.toLowerCase()
    && left.amount === right.amount
    && left.data === right.data;
}

function sameReviewedPlan(left: V3TransactionPlan, right: V3TransactionPlan) {
  return left.suiteReleaseId === right.suiteReleaseId
    && left.chainId === right.chainId
    && left.expectedSender.toLowerCase() === right.expectedSender.toLowerCase()
    && left.to.toLowerCase() === right.to.toLowerCase()
    && left.data === right.data
    && left.value === right.value
    && left.functionName === right.functionName
    && sameApproval(left.settlementApproval, right.settlementApproval);
}

/**
 * Executes a freshly prepared V3 plan without optimistic economic completion.
 * ERC-20 approval is exact, confirmed, and followed by a complete plan refresh.
 */
export async function executeV3Plan(input: {
  client: SepbaseV3Client;
  prepare: () => Promise<V3TransactionPlan>;
  adapter: V3PlanExecutionAdapter;
  onStage?: (stage: V3ExecutionStage) => void;
  onSubmitted?: (hash: Hash) => void | Promise<void>;
}): Promise<V3PlanExecutionResult> {
  const stage = (value: V3ExecutionStage) => input.onStage?.(value);
  try {
    stage("preparing");
    let plan = await input.prepare();
    input.client.assertTransactionPlan(plan);
    if (plan.chainId !== input.adapter.chainId) throw new Error("V3_WRONG_CHAIN");
    if (plan.expectedSender.toLowerCase() !== input.adapter.account.toLowerCase()) {
      throw new Error("V3_WRONG_ACCOUNT");
    }

    let approvalHash: Hash | null = null;
    const initialApproval = plan.settlementApproval;
    if (initialApproval) {
      stage("approval-check");
      const allowance = await input.adapter.readAllowance({
        token: initialApproval.token,
        owner: input.adapter.account,
        spender: initialApproval.spender,
      });
      if (allowance < initialApproval.amount) {
        const approvalTransaction: V3RawTransaction = {
          account: input.adapter.account,
          to: initialApproval.token,
          data: initialApproval.data,
          value: 0n,
          chainId: plan.chainId,
        };
        stage("approval-simulating");
        await input.adapter.simulate(approvalTransaction);
        stage("approval-signing");
        approvalHash = await input.adapter.send(approvalTransaction);
        stage("approval-confirming");
        const approvalReceipt = await input.adapter.waitForReceipt({
          hash: approvalHash,
          confirmations: input.client.manifest.requiredConfirmations,
        });
        if (approvalReceipt.status !== "success") throw new Error("V3_APPROVAL_REVERTED");

        stage("refreshing");
        const refreshed = await input.prepare();
        input.client.assertTransactionPlan(refreshed);
        if (!sameReviewedPlan(plan, refreshed)) throw new Error("V3_PLAN_CHANGED_AFTER_APPROVAL");
        const refreshedAllowance = await input.adapter.readAllowance({
          token: initialApproval.token,
          owner: input.adapter.account,
          spender: initialApproval.spender,
        });
        if (refreshedAllowance < initialApproval.amount) throw new Error("V3_APPROVAL_NOT_EFFECTIVE");
        plan = refreshed;
      }
    }

    stage("simulating");
    await input.adapter.simulate(rawTransaction(plan));
    stage("signing");
    const hash = await input.adapter.send(rawTransaction(plan));
    await input.onSubmitted?.(hash);
    stage("confirming");
    const reconciled = await input.client.reconcileTransaction(plan, hash);
    stage("confirmed");
    return { hash, blockNumber: reconciled.blockNumber, approvalHash, plan };
  } catch (error) {
    stage("error");
    throw error;
  }
}
