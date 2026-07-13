import "./lib/load-env";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { isMainModule } from "./lib/is-main";

const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

function fail(message: string): never {
  throw new Error(`V3 Safe deployment failed: ${message}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function checkedRpcUrl() {
  let url: URL;
  try {
    url = new URL(required("RPC_URL"));
  } catch {
    fail("RPC_URL must be an absolute URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    fail("RPC_URL must be an HTTPS URL without embedded userinfo or a fragment.");
  }
  return url.href;
}

function addressList(name: string): Address[] {
  const raw = required(name).split(",").map((value) => value.trim());
  if (raw.length < 2 || raw.some((value) => !isAddress(value))) {
    fail(`${name} must contain at least two comma-separated EVM addresses.`);
  }
  const addresses = raw.map((value) => getAddress(value));
  if (new Set(addresses).size !== addresses.length) fail(`${name} contains a duplicate address.`);
  return addresses;
}

function positiveInteger(name: string) {
  const raw = required(name);
  if (!/^[1-9][0-9]*$/.test(raw)) fail(`${name} must be a positive decimal integer.`);
  return Number(raw);
}

function requestedBroadcast() {
  const value = process.env.V3_SAFE_BROADCAST?.trim().toLowerCase() ?? "false";
  if (value !== "true" && value !== "false") fail("V3_SAFE_BROADCAST must be true or false.");
  return value === "true";
}

export async function deployV3Safe() {
  const rpcUrl = checkedRpcUrl();
  const owners = addressList("V3_SAFE_OWNER_ADDRESSES");
  const threshold = positiveInteger("V3_SAFE_THRESHOLD");
  if (threshold < 2 || threshold > owners.length) {
    fail("V3_SAFE_THRESHOLD must be at least two and no greater than the owner count.");
  }
  const saltNonce = required("V3_SAFE_SALT_NONCE");
  if (!/^(0|[1-9][0-9]*)$/.test(saltNonce)) {
    fail("V3_SAFE_SALT_NONCE must be an unsigned decimal integer.");
  }
  const safeVersion = required("V3_SAFE_VERSION");
  if (safeVersion !== "1.4.1") fail("the reviewed first V3 Safe version is 1.4.1.");
  const broadcast = requestedBroadcast();
  const privateKeyValue = process.env.PRIVATE_KEY?.trim();
  if (privateKeyValue && !/^0x[0-9a-fA-F]{64}$/.test(privateKeyValue)) {
    fail("PRIVATE_KEY has an invalid shape.");
  }
  const privateKey = privateKeyValue as Hex | undefined;
  if (broadcast && !privateKey) fail("PRIVATE_KEY is required only when V3_SAFE_BROADCAST=true.");

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, { retryCount: 2, timeout: 15_000 }),
  });
  if (await publicClient.getChainId() !== baseSepolia.id) fail("RPC is not Base Sepolia.");
  async function verifySafe(safeAddress: Address) {
    const code = await publicClient.getBytecode({ address: safeAddress });
    if (!code || code === "0x") fail("the predicted Safe was not deployed after confirmation.");
    const [actualOwners, actualThreshold] = await Promise.all([
      publicClient.readContract({ address: safeAddress, abi: safeAbi, functionName: "getOwners" }),
      publicClient.readContract({ address: safeAddress, abi: safeAbi, functionName: "getThreshold" }),
    ]);
    const actual = new Set(actualOwners.map((owner) => getAddress(owner)));
    if (
      actualThreshold !== BigInt(threshold)
      || actual.size !== owners.length
      || owners.some((owner) => !actual.has(owner))
    ) fail("deployed Safe owner or threshold state differs from the reviewed configuration.");
    return { owners: actualOwners.map((owner) => getAddress(owner)), threshold: actualThreshold };
  }

  const configuratorValue = required("V3_SUITE_CONFIGURATOR_ADDRESS");
  if (!isAddress(configuratorValue)) fail("V3_SUITE_CONFIGURATOR_ADDRESS must be an EVM address.");
  const configurator = getAddress(configuratorValue);
  if (!owners.includes(configurator)) {
    fail("the deployment configurator must be one of the reviewed Safe owners.");
  }
  if (privateKey && privateKeyToAccount(privateKey).address !== configurator) {
    fail("PRIVATE_KEY does not match V3_SUITE_CONFIGURATOR_ADDRESS.");
  }

  const protocolKit = await Safe.init({
    provider: rpcUrl,
    predictedSafe: {
      safeAccountConfig: { owners, threshold },
      safeDeploymentConfig: { safeVersion, saltNonce },
    },
  });
  const safeAddress = getAddress(await protocolKit.getAddress());
  const existingCode = await publicClient.getBytecode({ address: safeAddress });

  if (existingCode && existingCode !== "0x") {
    const state = await verifySafe(safeAddress);
    console.log(JSON.stringify({
      status: "already-deployed",
      chainId: baseSepolia.id,
      safeAddress,
      owners: state.owners,
      threshold: state.threshold.toString(),
      safeVersion,
      saltNonce,
    }, null, 2));
    return;
  }

  if (!broadcast) {
    console.log(JSON.stringify({
      status: "prediction-only",
      chainId: baseSepolia.id,
      safeAddress,
      owners,
      threshold: String(threshold),
      safeVersion,
      saltNonce,
      next: "Set V3_SAFE_BROADCAST=true only after reviewing this exact configuration.",
    }, null, 2));
    return;
  }

  const account = privateKeyToAccount(privateKey!);
  if (await publicClient.getBalance({ address: account.address }) === 0n) {
    fail("deployment signer has no Base Sepolia gas balance.");
  }
  const deployment = await protocolKit.createSafeDeploymentTransaction();
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const transactionHash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: getAddress(deployment.to),
    data: deployment.data as Hex,
    value: BigInt(deployment.value ?? "0"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 5,
    timeout: 180_000,
  });
  if (receipt.status !== "success") fail("Safe deployment receipt reverted.");
  const state = await verifySafe(safeAddress);
  console.log(JSON.stringify({
    status: "deployed",
    chainId: baseSepolia.id,
    safeAddress,
    transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    confirmations: 5,
    owners: state.owners,
    threshold: state.threshold.toString(),
    safeVersion,
    saltNonce,
  }, null, 2));
}

if (isMainModule(import.meta.url)) {
  deployV3Safe().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
