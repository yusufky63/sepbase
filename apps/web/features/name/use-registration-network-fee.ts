"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { usePublicClient } from "wagmi";
import { projectConfig } from "@/config/project.config";
import { deploymentManifest, protocolAddress } from "@/lib/deployment-manifest";
import { chainNameServiceAbi } from "@/lib/contract/abi.generated";

type RegistrationNetworkFeeParameters = {
  account: Address | undefined;
  amount: bigint;
  enabled: boolean;
  expectedReferralRewardBps: number;
  label: string;
  recipient: Address | undefined;
  referrer: Address | null;
  years: number;
};

export function useRegistrationNetworkFee({
  account,
  amount,
  enabled,
  expectedReferralRewardBps,
  label,
  recipient,
  referrer,
  years,
}: RegistrationNetworkFeeParameters) {
  const publicClient = usePublicClient({ chainId: deploymentManifest.chainId });

  return useQuery({
    queryKey: [
      "registration-network-fee",
      deploymentManifest.chainId,
      account,
      amount.toString(),
      expectedReferralRewardBps,
      label,
      recipient,
      referrer,
      years,
    ],
    queryFn: async () => {
      if (!publicClient || !protocolAddress || !account || !recipient) {
        throw new Error("Registration fee prerequisites are unavailable.");
      }

      const data = encodeFunctionData({
        abi: chainNameServiceAbi,
        functionName: "register",
        args: [
          label,
          years,
          recipient,
          referrer ?? zeroAddress,
          amount,
          referrer ? expectedReferralRewardBps : 0,
        ],
      });
      const request = {
        account,
        to: protocolAddress as Address,
        data,
        ...(deploymentManifest.settlement.kind === "native" ? { value: amount } : {}),
      } as const;

      if (projectConfig.chain.feeEstimation.kind === "op-stack") {
        return estimateTotalFee(publicClient, {
          ...request,
          gasPriceOracleAddress: projectConfig.chain.feeEstimation.gasPriceOracleAddress as Address,
          l1BlockAddress: projectConfig.chain.feeEstimation.l1BlockAddress as Address,
        });
      }

      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateGas(request),
        publicClient.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
    enabled: enabled && Boolean(publicClient && protocolAddress && account && recipient),
    staleTime: 15_000,
    retry: 1,
  });
}
