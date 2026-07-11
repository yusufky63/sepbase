import { defineChain, getAddress } from "viem";
import { projectConfig } from "@/config/project.config";

export const configuredChain = defineChain({
  id: projectConfig.chain.id,
  name: projectConfig.chain.name,
  nativeCurrency: projectConfig.chain.nativeCurrency,
  rpcUrls: {
    default: { http: [projectConfig.chain.rpcUrl] },
  },
  blockExplorers: {
    default: { name: `${projectConfig.chain.name} Explorer`, url: projectConfig.chain.explorerUrl },
  },
  contracts: {
    multicall3: {
      ...projectConfig.chain.multicall3,
      address: getAddress(projectConfig.chain.multicall3.address),
    },
  },
  testnet: projectConfig.chain.testnet,
});
