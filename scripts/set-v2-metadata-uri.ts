import "./lib/load-env";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { isMainModule } from "./lib/is-main";

const abi = parseAbi([
  "function owner() view returns (address)",
  "function metadataBaseURI() view returns (string)",
  "function setMetadataBaseURI(string newBaseURI)",
]);

function fail(message: string): never {
  throw new Error(`V2 metadata cutover failed: ${message}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function rpcUrl() {
  const value = required("RPC_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("RPC_URL must be an absolute URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    fail("RPC_URL must be HTTPS without embedded userinfo or a fragment.");
  }
  return parsed.href;
}

export async function setV2MetadataUri() {
  const contractValue = required("LEGACY_V2_CONTRACT_ADDRESS");
  if (!isAddress(contractValue)) fail("LEGACY_V2_CONTRACT_ADDRESS must be an EVM address.");
  const contractAddress = getAddress(contractValue);
  const privateKeyValue = required("PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKeyValue)) fail("PRIVATE_KEY has an invalid shape.");
  const privateKey = privateKeyValue as Hex;
  const account = privateKeyToAccount(privateKey);

  const siteUrl = new URL(required("NEXT_PUBLIC_SITE_URL"));
  if (siteUrl.protocol !== "https:" || siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1") {
    fail("NEXT_PUBLIC_SITE_URL must be the final public HTTPS origin.");
  }
  const expectedUri = new URL("/api/metadata/", siteUrl).href;
  const transport = http(rpcUrl(), { retryCount: 3, timeout: 20_000 });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  if (await publicClient.getChainId() !== baseSepolia.id) fail("RPC is not Base Sepolia.");

  const [owner, currentUri] = await Promise.all([
    publicClient.readContract({ address: contractAddress, abi, functionName: "owner" }),
    publicClient.readContract({ address: contractAddress, abi, functionName: "metadataBaseURI" }),
  ]);
  if (getAddress(owner) !== account.address) fail("PRIVATE_KEY does not control the live V2 owner.");
  if (currentUri === expectedUri) {
    console.log(JSON.stringify({
      status: "already-current",
      chainId: baseSepolia.id,
      contractAddress,
      metadataBaseURI: currentUri,
    }, null, 2));
    return;
  }

  const { request } = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi,
    functionName: "setMetadataBaseURI",
    args: [expectedUri],
  });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const transactionHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 5,
    timeout: 180_000,
  });
  if (receipt.status !== "success") fail("metadata transaction reverted.");
  const confirmedUri = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "metadataBaseURI",
    blockNumber: receipt.blockNumber + 4n,
  });
  if (confirmedUri !== expectedUri) fail("confirmed on-chain metadata URI differs from the final origin.");
  console.log(JSON.stringify({
    status: "updated",
    chainId: baseSepolia.id,
    contractAddress,
    previousMetadataBaseURI: currentUri,
    metadataBaseURI: confirmedUri,
    transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    confirmations: 5,
  }, null, 2));
}

if (isMainModule(import.meta.url)) {
  setV2MetadataUri().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
