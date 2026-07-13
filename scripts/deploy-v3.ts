import "./lib/load-env";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseV3SuiteManifest, type V3SuiteManifest } from "../packages/sdk/src/v3-manifest";
import { resolveForgeExecutable } from "./lib/foundry";
import { isMainModule } from "./lib/is-main";
import { getVerifierConfig } from "./lib/verifier";
import { validateV3Artifacts } from "./validate-v3-artifacts";

const BASE_SEPOLIA_CHAIN_ID = 84_532;
const REQUIRED_PROFILE_HASH =
  "0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638";
const BASE_SEPOLIA_USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const UINT64_MAX = (1n << 64n) - 1n;
const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);
const erc20MetadataAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

type DeploymentAuthorities = {
  owner: Address;
  treasury: Address;
  attestor: Address;
  configurator: Address;
  migrationStartsAt: bigint;
  migrationEndsAt: bigint;
  privateKey: `0x${string}` | null;
  broadcast: boolean;
};

function fail(message: string): never {
  throw new Error(`V3 deployment preflight failed: ${message}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function addressEnv(name: string): Address {
  const value = required(name);
  if (!isAddress(value)) fail(`${name} must be an EVM address.`);
  const address = getAddress(value);
  if (address === zeroAddress) fail(`${name} cannot be zero.`);
  return address;
}

function uint64Env(name: string) {
  const value = required(name);
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) fail(`${name} must be a decimal integer.`);
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) fail(`${name} exceeds uint64.`);
  return parsed;
}

function checkedRpcUrl() {
  let url: URL;
  try {
    url = new URL(required("RPC_URL"));
  } catch {
    fail("RPC_URL must be an absolute URL.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
  ) fail("RPC_URL must be an HTTPS URL without embedded userinfo or a fragment.");
  return url.href;
}

function requestedBroadcast() {
  const value = process.env.V3_BROADCAST?.trim().toLowerCase() ?? "false";
  if (value !== "true" && value !== "false") fail("V3_BROADCAST must be true or false.");
  return value === "true";
}

function deploymentAuthorities(): DeploymentAuthorities {
  if (!/^[a-f0-9]{40}$/.test(required("SOURCE_COMMIT"))) {
    fail("SOURCE_COMMIT must be the reviewed lowercase 40-character source commit.");
  }
  const owner = addressEnv("OWNER_ADDRESS");
  const treasury = addressEnv("TREASURY_ADDRESS");
  const attestor = addressEnv("NORMALIZATION_ATTESTOR_ADDRESS");
  const configurator = addressEnv("V3_SUITE_CONFIGURATOR_ADDRESS");
  const migrationStartsAt = uint64Env("MIGRATION_START_TIMESTAMP");
  const migrationEndsAt = uint64Env("MIGRATION_END_TIMESTAMP");
  if (migrationStartsAt >= migrationEndsAt) fail("migration start must be before migration end.");
  const broadcast = requestedBroadcast();
  const configuredKey = process.env.PRIVATE_KEY?.trim();
  let privateKey: `0x${string}` | null = null;
  if (configuredKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(configuredKey)) fail("PRIVATE_KEY has an invalid shape.");
    privateKey = configuredKey as `0x${string}`;
    if (privateKeyToAccount(privateKey).address !== configurator) {
      fail("PRIVATE_KEY does not match V3_SUITE_CONFIGURATOR_ADDRESS.");
    }
  }
  if (broadcast && !privateKey) fail("PRIVATE_KEY is required only when V3_BROADCAST=true.");
  if (owner !== treasury) {
    fail("OWNER_ADDRESS and TREASURY_ADDRESS must be the same reviewed governance Safe.");
  }
  const distinct = new Set([owner, attestor, configurator]);
  if (distinct.size !== 3) {
    fail("governance Safe, normalization attestor, and suite configurator must be distinct.");
  }
  return {
    owner,
    treasury,
    attestor,
    configurator,
    migrationStartsAt,
    migrationEndsAt,
    privateKey,
    broadcast,
  };
}

function reviewedMultisigs() {
  const values = required("V3_REVIEWED_MULTISIG_ADDRESSES").split(",").map((value) => value.trim());
  if (values.some((value) => !isAddress(value))) {
    fail("V3_REVIEWED_MULTISIG_ADDRESSES contains an invalid address.");
  }
  return new Set(values.map((value) => getAddress(value)));
}

function reviewedConfiguratorDelegationTargets() {
  const values = required("V3_ALLOWED_CONFIGURATOR_DELEGATION_TARGETS")
    .split(",")
    .map((value) => value.trim());
  if (values.some((value) => !isAddress(value))) {
    fail("V3_ALLOWED_CONFIGURATOR_DELEGATION_TARGETS contains an invalid address.");
  }
  return new Set(values.map((value) => getAddress(value)));
}

async function assertSafeMultisig(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
  label: string,
) {
  const code = await client.getBytecode({ address });
  if (!code || code === "0x") fail(`${label} must be a deployed contract multisig.`);
  let owners: readonly Address[];
  let threshold: bigint;
  try {
    [owners, threshold] = await Promise.all([
      client.readContract({ address, abi: safeAbi, functionName: "getOwners" }),
      client.readContract({ address, abi: safeAbi, functionName: "getThreshold" }),
    ]);
  } catch {
    fail(`${label} does not expose the reviewed Safe multisig interface.`);
  }
  if (owners.length < 2 || threshold < 2n || threshold > BigInt(owners.length)) {
    fail(`${label} must have at least two owners and a threshold of at least two.`);
  }
}

function packedMultipliers(manifest: V3SuiteManifest) {
  const [one, two, three] = manifest.pricing.shortNamePriceMultipliers;
  return String(one | (two << 8) | (three << 16));
}

function forgeEnvironment(manifest: V3SuiteManifest, authorities: DeploymentAuthorities) {
  return {
    ...process.env,
    ...(authorities.privateKey ? { PRIVATE_KEY: authorities.privateKey } : {}),
    OWNER_ADDRESS: authorities.owner,
    TREASURY_ADDRESS: authorities.treasury,
    COLLECTION_NAME: manifest.collection.name,
    COLLECTION_SYMBOL: manifest.collection.symbol,
    NAME_SUFFIX: manifest.suffix,
    SUFFIX_NODE: manifest.suffixNode,
    REVERSE_ROOT_NODE: manifest.reverseRootNode,
    NORMALIZATION_PROFILE_HASH: manifest.normalization.profileHash,
    NORMALIZATION_ATTESTOR_ADDRESS: authorities.attestor,
    GRACE_PERIOD_SECONDS: manifest.gracePeriodSeconds,
    METADATA_BASE_URI: manifest.metadataBaseURI,
    MIN_COMMITMENT_AGE_SECONDS: manifest.commitment.minAgeSeconds,
    MAX_COMMITMENT_AGE_SECONDS: manifest.commitment.maxAgeSeconds,
    MAX_NORMALIZATION_ATTESTATION_VALIDITY_SECONDS:
      manifest.normalization.maxAttestationValiditySeconds,
    SETTLEMENT_KIND: manifest.settlement.kind,
    SETTLEMENT_TOKEN_ADDRESS: manifest.settlement.tokenAddress ?? zeroAddress,
    ANNUAL_PRICE_BASE_UNITS: manifest.pricing.annualPriceBaseUnits,
    SHORT_NAME_PRICE_MULTIPLIERS: packedMultipliers(manifest),
    REFERRAL_REWARD_BPS: String(manifest.pricing.referralRewardBps),
    MARKETPLACE_FEE_BPS: String(manifest.pricing.marketplaceFeeBps),
    MIN_BID_INCREMENT_BPS: String(manifest.marketplace.minBidIncrementBps),
    AUCTION_EXTENSION_WINDOW_SECONDS: manifest.marketplace.antiSnipingWindowSeconds,
    AUCTION_EXTENSION_DURATION_SECONDS: manifest.marketplace.extensionDurationSeconds,
    AUCTION_MAX_EXTENSIONS: String(manifest.marketplace.maxExtensions),
    LEGACY_V2_CONTRACT_ADDRESS: manifest.migration.legacyContract,
    MIGRATION_START_TIMESTAMP: authorities.migrationStartsAt.toString(),
    MIGRATION_END_TIMESTAMP: authorities.migrationEndsAt.toString(),
  };
}

function runForge(args: string[], label: string, environment = process.env) {
  const result = spawnSync(resolveForgeExecutable(), args, {
    cwd: resolve(process.cwd(), "contracts"),
    env: environment,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${label} exited unsuccessfully.`);
}

function assertSourceProvenance(broadcast: boolean) {
  if (!broadcast) return;
  const expectedCommit = required("SOURCE_COMMIT");
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (
    head.status !== 0
    || status.status !== 0
    || head.stdout.trim() !== expectedCommit
    || status.stdout.trim() !== ""
  ) fail("broadcast requires SOURCE_COMMIT to equal a clean git HEAD.");
}

async function preflight(
  manifest: V3SuiteManifest,
  rpcUrl: string,
  authorities: DeploymentAuthorities,
) {
  if (
    manifest.releaseStatus !== "draft"
    || manifest.schemaVersion !== 4
    || manifest.chainId !== BASE_SEPOLIA_CHAIN_ID
  ) fail("deployment requires the schema-v4 Base Sepolia draft manifest.");
  if (
    manifest.normalization.profileHash.toLowerCase() !== REQUIRED_PROFILE_HASH
    || manifest.commitment.minAgeSeconds !== "60"
    || BigInt(manifest.commitment.maxAgeSeconds) > 86_400n
  ) fail("normalization profile or commitment timing differs from the reviewed first V3 profile.");
  if (
    manifest.settlement.kind !== "erc20"
    || !manifest.settlement.tokenAddress
    || manifest.settlement.tokenAddress !== BASE_SEPOLIA_USDC
    || manifest.settlement.decimals !== 6
    || manifest.x402.paymentAsset !== manifest.settlement.tokenAddress
    || manifest.x402.assetDecimals !== manifest.settlement.decimals
    || manifest.x402.paidExecutionAvailable
  ) fail("the V3 deployment draft requires one standard 6-decimal ERC-20 and must remain x402 activation-gated until post-deployment runtime evidence is verified.");

  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 2, timeout: 15_000 }) });
  if (await client.getChainId() !== manifest.chainId) fail("RPC chain ID differs from the draft manifest.");
  const latest = await client.getBlock({ blockTag: "latest" });
  if (authorities.migrationStartsAt <= latest.timestamp) {
    fail("migration start must remain in the future at deployment preflight.");
  }
  const reviewed = reviewedMultisigs();
  if (!reviewed.has(authorities.owner)) {
    fail("the shared owner/treasury Safe must appear in V3_REVIEWED_MULTISIG_ADDRESSES.");
  }
  await assertSafeMultisig(client, authorities.owner, "OWNER_ADDRESS/TREASURY_ADDRESS");
  const configuratorCode = await client.getBytecode({ address: authorities.configurator });
  if (configuratorCode && configuratorCode !== "0x") {
    if (!/^0xef0100[0-9a-fA-F]{40}$/.test(configuratorCode)) {
      fail("V3_SUITE_CONFIGURATOR_ADDRESS has non-EIP-7702 contract code.");
    }
    const delegationTarget = getAddress(`0x${configuratorCode.slice(8)}`);
    if (!reviewedConfiguratorDelegationTargets().has(delegationTarget)) {
      fail("the configurator EIP-7702 delegation target is not explicitly reviewed.");
    }
    const delegationCode = await client.getBytecode({ address: delegationTarget });
    if (!delegationCode || delegationCode === "0x") {
      fail("the reviewed configurator EIP-7702 delegation target is not deployed.");
    }
  }
  if (await client.getBalance({ address: authorities.configurator }) === 0n) {
    fail("V3_SUITE_CONFIGURATOR_ADDRESS has no gas balance.");
  }

  const token = manifest.settlement.tokenAddress;
  const [tokenCode, tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
    client.getBytecode({ address: token }),
    client.readContract({ address: token, abi: erc20MetadataAbi, functionName: "name" }),
    client.readContract({ address: token, abi: erc20MetadataAbi, functionName: "symbol" }),
    client.readContract({ address: token, abi: erc20MetadataAbi, functionName: "decimals" }),
  ]);
  if (
    !tokenCode
    || tokenCode === "0x"
    || tokenName !== manifest.settlement.name
    || tokenSymbol !== manifest.settlement.symbol
    || tokenDecimals !== manifest.settlement.decimals
  ) fail("live settlement token code/metadata differs from the draft manifest.");
}

export async function deployV3() {
  const root = process.cwd();
  const manifest = parseV3SuiteManifest(JSON.parse(
    await readFile(resolve(root, "apps/web/public/deployment-manifest.v3.json"), "utf8"),
  ) as unknown);
  const rpcUrl = checkedRpcUrl();
  const authorities = deploymentAuthorities();
  assertSourceProvenance(authorities.broadcast);

  runForge(["fmt", "--check"], "forge fmt --check");
  runForge(["build"], "forge build");
  runForge(["build", "--sizes"], "forge build --sizes");
  runForge(["test", "-vvv"], "forge test -vvv");
  await validateV3Artifacts({ root });
  await preflight(manifest, rpcUrl, authorities);

  if (!authorities.broadcast) {
    return { broadcast: false, chainId: manifest.chainId } as const;
  }
  const verifierConfig = getVerifierConfig(manifest.chainId);
  if (verifierConfig.verifier === "none") fail("V3 broadcast requires source verification.");
  const args = [
    "script",
    "script/DeployV3.s.sol:DeployV3",
    "--chain",
    String(manifest.chainId),
    "--broadcast",
    "--slow",
    "--verify",
    "--verifier",
    verifierConfig.verifier,
  ];
  if (verifierConfig.url) args.push("--verifier-url", verifierConfig.url);
  const environment = {
    ...forgeEnvironment(manifest, authorities),
    // Keep authenticated provider paths/query tokens out of argv and process listings.
    ETH_RPC_URL: rpcUrl,
    ...(verifierConfig.apiKey ? { ETHERSCAN_API_KEY: verifierConfig.apiKey } : {}),
  };
  runForge(args, "DeployV3 broadcast and verification", environment);
  return { broadcast: true, chainId: manifest.chainId } as const;
}

if (isMainModule(import.meta.url)) {
  try {
    const result = await deployV3();
    console.log(
      result.broadcast
        ? "V3 deployment broadcast completed; wait for required confirmations before promotion."
        : "V3 preflight and Foundry gates passed; broadcast was not requested.",
    );
  } catch (error: unknown) {
    const safeMessage = error instanceof Error
      && error.message.startsWith("V3 deployment preflight failed:")
      ? error.message
      : "V3 deployment failed closed. No credential or secret value was logged.";
    console.error(safeMessage);
    process.exitCode = 1;
  }
}
