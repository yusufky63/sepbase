"use client";

import { useEffect, useState } from "react";
import { type Address, erc20Abi, zeroAddress } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";

export function useSettlementApproval(amount: bigint) {
  const { address, chainId } = useAccount();
  const token = (deploymentManifest.settlement.tokenAddress ?? zeroAddress) as Address;
  const spender = (protocolAddress ?? zeroAddress) as Address;
  const enabled = deploymentManifest.settlement.kind === "erc20" && address !== undefined && protocolAddress !== null;
  const allowance = useReadContract({
    chainId: deploymentManifest.chainId,
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, spender],
    query: { enabled },
  });
  const write = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [approvalError, setApprovalError] = useState<Error | null>(null);
  const receipt = useWaitForTransactionReceipt({
    hash,
    confirmations: deploymentManifest.requiredConfirmations,
    query: { enabled: hash !== undefined },
  });
  const refetchAllowance = allowance.refetch;

  useEffect(() => {
    if (receipt.isSuccess) void refetchAllowance();
  }, [receipt.isSuccess, refetchAllowance]);

  async function approve() {
    setApprovalError(null);
    setHash(undefined);
    write.reset();
    try {
      if (!protocolAddress) throw new Error("Contract not deployed.");
      if (!address) throw new Error("Wallet not connected.");
      if (chainId !== deploymentManifest.chainId) throw new Error("Wrong network.");
      const nextHash = await write.writeContractAsync({
        account: address,
        chainId: deploymentManifest.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      });
      setHash(nextHash);
      return nextHash;
    } catch (error) {
      setApprovalError(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  }

  return {
    ready: !enabled || (!allowance.isLoading && !allowance.isError && allowance.data !== undefined),
    required: enabled && allowance.data !== undefined && allowance.data < amount,
    approve,
    hash,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: approvalError ?? allowance.error ?? write.error ?? receipt.error,
  };
}
