"use client";

import { useEffect, useState } from "react";
import { type Address, erc20Abi, zeroAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { chainNameServiceAbi } from "@/lib/contract/abi.generated";
import { useDeploymentConsistency } from "@/lib/contract/hooks";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";

export type SettlementApprovalOperation = "register" | "renew" | "buy";

type ApprovalReads = readonly [bigint, bigint, boolean, boolean];

export function deriveSettlementApprovalState(
  data: ApprovalReads | undefined,
  amount: bigint,
  operation: SettlementApprovalOperation,
) {
  if (!data) {
    return {
      allowance: null,
      balance: null,
      healthAllowsPayment: false,
      required: null,
      sufficientBalance: null,
    } as const;
  }
  const [balance, allowance, solvent, paused] = data;
  const healthAllowsPayment = solvent && (operation === "renew" || !paused);
  return {
    allowance,
    balance,
    healthAllowsPayment,
    required: allowance < amount,
    sufficientBalance: balance >= amount,
  } as const;
}

export function useSettlementApproval(amount: bigint, operation: SettlementApprovalOperation) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: deploymentManifest.chainId });
  const deployment = useDeploymentConsistency();
  const token = (deploymentManifest.settlement.tokenAddress ?? zeroAddress) as Address;
  const spender = (protocolAddress ?? zeroAddress) as Address;
  const isErc20 = deploymentManifest.settlement.kind === "erc20";
  const enabled = isErc20 && address !== undefined && protocolAddress !== null;
  const pauseFunctionName = operation === "buy" ? "marketplacePaused" : "registrationsPaused";
  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        chainId: deploymentManifest.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address ?? zeroAddress],
      },
      {
        chainId: deploymentManifest.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? zeroAddress, spender],
      },
      {
        chainId: deploymentManifest.chainId,
        address: spender,
        abi: chainNameServiceAbi,
        functionName: "isSolvent",
      },
      {
        chainId: deploymentManifest.chainId,
        address: spender,
        abi: chainNameServiceAbi,
        functionName: pauseFunctionName,
      },
    ],
    query: { enabled },
  });
  const currentState = deriveSettlementApprovalState(reads.data as ApprovalReads | undefined, amount, operation);
  const write = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [approvalError, setApprovalError] = useState<Error | null>(null);
  const receipt = useWaitForTransactionReceipt({
    hash,
    confirmations: deploymentManifest.requiredConfirmations,
    query: { enabled: hash !== undefined },
  });
  const refetchReads = reads.refetch;

  useEffect(() => {
    if (receipt.isSuccess) void refetchReads();
  }, [receipt.isSuccess, refetchReads]);

  async function approve() {
    setApprovalError(null);
    setHash(undefined);
    write.reset();
    try {
      if (!isErc20) throw new Error("This deployment does not use ERC-20 settlement.");
      if (!protocolAddress) throw new Error("Contract not deployed.");
      if (!deployment.ready) throw new Error("Deployment configuration could not be verified.");
      if (!address || !publicClient) throw new Error("Wallet not connected.");
      if (chainId !== deploymentManifest.chainId) throw new Error("Wrong network.");
      if (amount <= 0n) throw new Error("Approval amount must be greater than zero.");

      const refreshed = await refetchReads();
      if (refreshed.error || refreshed.data === undefined) {
        throw new Error("Settlement balance, allowance, and protocol health could not be verified.");
      }
      const freshState = deriveSettlementApprovalState(refreshed.data as ApprovalReads, amount, operation);
      if (!freshState.healthAllowsPayment) throw new Error("The requested payment operation is currently unavailable.");
      if (!freshState.sufficientBalance) throw new Error("Insufficient settlement-token balance.");
      if (!freshState.required) throw new Error("The required allowance is already available.");

      const simulation = await publicClient.simulateContract({
        account: address,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      });
      const nextHash = await write.writeContractAsync(simulation.request);
      setHash(nextHash);
      return nextHash;
    } catch (error) {
      setApprovalError(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  }

  const nativeReady = !isErc20;
  const erc20Ready = enabled
    && chainId === deploymentManifest.chainId
    && deployment.ready
    && !reads.isLoading
    && !reads.isError
    && reads.data !== undefined
    && currentState.healthAllowsPayment;

  return {
    ready: nativeReady || erc20Ready,
    required: nativeReady ? false : currentState.required,
    sufficientBalance: nativeReady ? true : currentState.sufficientBalance,
    balance: nativeReady ? null : currentState.balance,
    allowance: nativeReady ? null : currentState.allowance,
    approve,
    hash,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: approvalError ?? reads.error ?? write.error ?? receipt.error,
  };
}
