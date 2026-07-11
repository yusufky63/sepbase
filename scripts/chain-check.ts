import "./lib/load-env";
import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { projectConfig } from "../apps/web/config/project.config";
import { validateProject } from "./validate-project";
import { isMainModule } from "./lib/is-main";
import { getVerifierConfig } from "./lib/verifier";

export async function checkChain(): Promise<void> {
  validateProject();
  const client = createPublicClient({ transport: http(projectConfig.chain.rpcUrl, { timeout: 10_000 }) });
  const [chainId, blockNumber, gasPrice] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);
  if (chainId !== projectConfig.chain.id) {
    throw new Error(`RPC chain ID ${chainId} does not match configured ${projectConfig.chain.id}.`);
  }

  console.log(`RPC OK: ${projectConfig.chain.name} block ${blockNumber}, gas ${gasPrice}.`);
  const key = process.env.PRIVATE_KEY;
  if (key) {
    const account = privateKeyToAccount(key as `0x${string}`);
    const balance = await client.getBalance({ address: account.address });
    console.log(`Deployer ${account.address}: ${balance} base units.`);
    if (balance === 0n) throw new Error("Deployer has no native currency for gas.");
  }
  if (projectConfig.settlement.kind === "erc20") {
    const token = getAddress(projectConfig.settlement.tokenAddress);
    const [bytecode, name, symbol, decimals] = await Promise.all([
      client.getBytecode({ address: token }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ]);
    if (!bytecode || bytecode === "0x") throw new Error("Configured settlement token has no bytecode.");
    if (
      name !== projectConfig.settlement.name
      || symbol !== projectConfig.settlement.symbol
      || decimals !== projectConfig.settlement.decimals
    ) throw new Error("Configured settlement token metadata does not match the chain.");
  }

  if (key) {
    const { verifier } = getVerifierConfig(projectConfig.chain.id);
    if (verifier === "none" && projectConfig.chain.rpcUrl.startsWith("http") && !/localhost|127\.0\.0\.1/.test(projectConfig.chain.rpcUrl)) {
      throw new Error("Public deployments require source verification.");
    }
  }
}

if (isMainModule(import.meta.url)) {
  await checkChain();
}
