import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { projectConfig } from "@/config/project.config";
import { configuredChain } from "./chain";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors = [
  injected(),
  coinbaseWallet({ appName: projectConfig.brand.name }),
  ...(walletConnectProjectId
    ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [configuredChain],
  connectors,
  ssr: true,
  transports: {
    [configuredChain.id]: http(projectConfig.chain.rpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
