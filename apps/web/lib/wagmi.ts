import { createConfig, http } from "wagmi";
import { coinbaseWallet, walletConnect } from "wagmi/connectors";
import { projectConfig } from "@/config/project.config";
import { configuredChain } from "./chain";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors = [
  coinbaseWallet({ appName: projectConfig.brand.name }),
  ...(walletConnectProjectId
    ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [configuredChain],
  connectors,
  // Rabby, MetaMask, and other modern injected wallets are discovered through
  // EIP-6963. Do not add a targetless `injected()` fallback: when two wallet
  // extensions compete for `window.ethereum`, that fallback can bind the dApp
  // to a different provider than the wallet the user selected.
  multiInjectedProviderDiscovery: true,
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
