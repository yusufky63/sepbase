import {
  type Abi,
  type Address,
  type Chain,
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  type PublicClient,
  zeroAddress,
} from "viem";
import {
  ManifestMismatchError,
  NotDeployedError,
  RpcUnavailableError,
  SepbaseError,
} from "./errors.js";
import { assertSafeFetchResponse, resolveManifestUrl } from "./manifest.js";
import {
  loadV3SuiteManifest,
  isPrivateV3NetworkHost,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "./v3-manifest.js";

export type V3SuiteContract = { address: Address; abi: Abi };

export type V3SuiteContext = {
  manifest: V3SuiteManifest;
  origin: URL;
  chain: Chain;
  publicClient: PublicClient;
  contracts: Record<V3SuiteModuleKey, V3SuiteContract>;
  verificationBlockNumber: bigint;
};

function safeRpcUrl(value: string, allowedOrigins?: readonly string[]) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new ManifestMismatchError("V3 RPC URLs must use HTTPS outside loopback development.");
  }
  if (url.username || url.password) throw new ManifestMismatchError("V3 RPC URLs cannot contain credentials.");
  if (isPrivateV3NetworkHost(url.hostname)) throw new ManifestMismatchError("V3 RPC URL cannot target a private network.");
  if (allowedOrigins && !allowedOrigins.map((origin) => new URL(origin).origin).includes(url.origin)) {
    throw new ManifestMismatchError("V3 RPC origin is not in the explicit allowlist.");
  }
  return url.href;
}

export function assertV3DeploymentConfirmation(
  manifest: V3SuiteManifest,
  latestBlockNumber: bigint,
) {
  if (manifest.deployment.blockNumber === null) {
    throw new ManifestMismatchError("V3 deployment block is missing.");
  }
  const deploymentBlock = BigInt(manifest.deployment.blockNumber);
  const confirmationDepth = BigInt(manifest.requiredConfirmations - 1);
  const confirmationTarget = deploymentBlock + confirmationDepth;
  if (latestBlockNumber < confirmationTarget) {
    throw new ManifestMismatchError("V3 deployment has not reached the manifest confirmation floor.");
  }
  const verificationBlockNumber = latestBlockNumber - confirmationDepth;
  assertV3VerificationBlock(manifest, verificationBlockNumber);
  return verificationBlockNumber;
}

export function assertV3VerificationBlock(
  manifest: V3SuiteManifest,
  verificationBlockNumber: bigint,
) {
  if (manifest.deployment.blockNumber === null
    || verificationBlockNumber < BigInt(manifest.deployment.blockNumber)) {
    throw new ManifestMismatchError("V3 verification block predates deployment.");
  }
  if (BigInt(manifest.multicall3.blockCreated) > verificationBlockNumber) {
    throw new ManifestMismatchError("Configured Multicall3 did not exist at the verification block.");
  }
}

async function loadAbi(
  manifestUrl: URL,
  path: string,
  expectedDigest: string,
  fetcher: typeof fetch,
): Promise<Abi> {
  const url = resolveManifestUrl(path, manifestUrl);
  const response = await fetcher(url, { redirect: "manual" });
  assertSafeFetchResponse(response, url, "V3 contract ABI");
  if (!response.ok) {
    throw new SepbaseError("A V3 contract ABI could not be loaded.", "ABI_UNAVAILABLE", response.status);
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedDigest) throw new ManifestMismatchError("A V3 ABI checksum does not match the suite manifest.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Abi;
  } catch {
    throw new ManifestMismatchError("A V3 ABI artifact is not valid JSON.");
  }
}

function sameAddress(left: unknown, right: Address | null) {
  return typeof left === "string" && right !== null && getAddress(left) === getAddress(right);
}

function assertAddress(value: unknown, expected: Address | null, label: string) {
  if (!sameAddress(value, expected)) throw new ManifestMismatchError(`${label} does not match the V3 manifest.`);
}

function assertEqual(value: unknown, expected: unknown, label: string) {
  if (value !== expected) throw new ManifestMismatchError(`${label} does not match the V3 manifest.`);
}

export async function createV3SuiteContext(options: {
  manifestUrl: string | URL;
  rpcUrl?: string;
  fetcher?: typeof fetch;
  allowedManifestOrigins?: readonly string[];
  allowedRpcOrigins?: readonly string[];
}): Promise<V3SuiteContext> {
  const fetcher = options.fetcher ?? fetch;
  const requestedManifestUrl = new URL(options.manifestUrl);
  if (
    options.allowedManifestOrigins
    && !options.allowedManifestOrigins.map((origin) => new URL(origin).origin).includes(requestedManifestUrl.origin)
  ) {
    throw new ManifestMismatchError("V3 manifest origin is not in the explicit allowlist.");
  }
  const { manifest, origin } = await loadV3SuiteManifest(options.manifestUrl, fetcher);
  if (manifest.releaseStatus === "draft") throw new NotDeployedError();

  const contracts = {} as Record<V3SuiteModuleKey, V3SuiteContract>;
  for (const key of V3_SUITE_MODULE_KEYS) {
    const module = manifest.contracts[key];
    if (!module.address || !module.runtimeCodeHash) throw new ManifestMismatchError("V3 suite deployment identity is incomplete.");
    contracts[key] = {
      address: module.address,
      abi: await loadAbi(origin, module.abiUrl, module.abiSha256, fetcher),
    };
  }

  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.chainName,
    nativeCurrency: manifest.nativeCurrency,
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: manifest.explorerUrl } },
    contracts: {
      multicall3: {
        address: manifest.multicall3.address,
        blockCreated: manifest.multicall3.blockCreated,
      },
    },
    testnet: manifest.testnet,
  });
  const allowedRpcOrigins = options.allowedRpcOrigins
    ?? (options.rpcUrl ? [new URL(manifest.rpcUrl).origin] : undefined);
  const rpcUrl = safeRpcUrl(options.rpcUrl ?? manifest.rpcUrl, allowedRpcOrigins);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, {
      batch: { batchSize: 50, wait: 25 },
      fetchOptions: { redirect: "error" },
      retryCount: 3,
      retryDelay: 500,
      timeout: 20_000,
    }),
  }) as PublicClient;
  let verificationBlockNumber: bigint;

  try {
    const [chainId, pinnedBlockNumber] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getBlockNumber(),
    ]);
    verificationBlockNumber = assertV3DeploymentConfirmation(manifest, pinnedBlockNumber);
    assertEqual(chainId, manifest.chainId, "RPC chain ID");
    const [multicallCode, ...moduleCodes] = await Promise.all([
      publicClient.getBytecode({ address: manifest.multicall3.address, blockNumber: verificationBlockNumber }),
      ...V3_SUITE_MODULE_KEYS.map((key) => publicClient.getBytecode({
        address: contracts[key].address,
        blockNumber: verificationBlockNumber,
      })),
    ]);
    if (!multicallCode || multicallCode === "0x") throw new ManifestMismatchError("Configured Multicall3 has no bytecode.");
    for (const [index, key] of V3_SUITE_MODULE_KEYS.entries()) {
      const bytecode = moduleCodes[index];
      if (!bytecode || bytecode === "0x") throw new ManifestMismatchError(`${key} has no runtime bytecode.`);
      assertEqual(keccak256(bytecode), manifest.contracts[key].runtimeCodeHash, `${key} runtime code hash`);
    }

    const versions = await Promise.all(V3_SUITE_MODULE_KEYS.map((key) => publicClient.readContract({
      ...contracts[key],
      functionName: "VERSION",
      blockNumber: verificationBlockNumber,
    })));
    versions.forEach((version, index) => assertEqual(version, "3.0.0", `${V3_SUITE_MODULE_KEYS[index]} VERSION`));

    const [
      suiteConfigured,
      registryController,
      registryResolver,
      registryMigration,
      registryMarketplace,
      suffix,
      suffixNode,
      reverseRootNode,
      profileHash,
      metadataBaseURI,
      registryOwner,
      resolverRegistry,
      controllerRegistry,
      controllerResolver,
      controllerAttestor,
      controllerOwner,
      controllerTreasury,
      controllerSettlementKind,
      controllerSettlementToken,
      marketplaceRegistry,
      marketplaceController,
      marketplaceOwner,
      marketplaceTreasury,
      marketplaceSettlementKind,
      marketplaceSettlementToken,
      lensMarketplace,
      lensRegistry,
      migrationRegistry,
      migrationResolver,
      migrationLegacy,
      migrationSourceChain,
      migrationOwner,
      universalRegistry,
    ] = await Promise.all([
      publicClient.readContract({ ...contracts.registry, functionName: "suiteConfigured", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "controller", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "resolverContract", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "migrationController", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "marketplace", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "suffix", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "suffixNode", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "reverseRootNode", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "normalizationProfileHash", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "metadataBaseURI", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "owner", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.resolver, functionName: "registry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "registry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "resolver", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "normalizationAttestor", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "owner", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "treasury", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "settlementKind", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "settlementToken", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "registry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "controller", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "owner", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "treasury", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "settlementKind", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "settlementToken", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketLens, functionName: "marketplace", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketLens, functionName: "registry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "registry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "resolver", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "legacyRegistry", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "sourceChainId", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "owner", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.universalResolver, functionName: "registry", blockNumber: verificationBlockNumber }),
    ]);

    assertEqual(suiteConfigured, true, "Registry suite lock");
    assertAddress(registryController, contracts.controller.address, "Registry controller wiring");
    assertAddress(registryResolver, contracts.resolver.address, "Registry resolver wiring");
    assertAddress(registryMigration, contracts.migration.address, "Registry migration wiring");
    assertAddress(registryMarketplace, contracts.marketplace.address, "Registry marketplace wiring");
    assertEqual(suffix, manifest.suffix, "Registry suffix");
    assertEqual(suffixNode, manifest.suffixNode, "Registry suffix node");
    assertEqual(reverseRootNode, manifest.reverseRootNode, "Registry reverse root");
    assertEqual(profileHash, manifest.normalization.profileHash, "Normalization profile hash");
    assertEqual(metadataBaseURI, manifest.metadataBaseURI, "Metadata base URI");
    assertAddress(registryOwner, manifest.deployment.owner, "Registry owner");
    assertAddress(resolverRegistry, contracts.registry.address, "Resolver registry wiring");
    assertAddress(controllerRegistry, contracts.registry.address, "Controller registry wiring");
    assertAddress(controllerResolver, contracts.resolver.address, "Controller resolver wiring");
    assertAddress(controllerAttestor, manifest.normalization.attestor, "Normalization attestor");
    assertAddress(controllerOwner, manifest.deployment.owner, "Controller owner");
    assertAddress(controllerTreasury, manifest.deployment.treasury, "Controller treasury");
    assertAddress(marketplaceRegistry, contracts.registry.address, "Marketplace registry wiring");
    assertAddress(marketplaceController, contracts.controller.address, "Marketplace controller wiring");
    assertAddress(marketplaceOwner, manifest.deployment.owner, "Marketplace owner");
    assertAddress(marketplaceTreasury, manifest.deployment.treasury, "Marketplace treasury");
    assertAddress(lensMarketplace, contracts.marketplace.address, "Market lens wiring");
    assertAddress(lensRegistry, contracts.registry.address, "Market lens registry wiring");
    assertAddress(migrationRegistry, contracts.registry.address, "Migration registry wiring");
    assertAddress(migrationResolver, contracts.resolver.address, "Migration resolver wiring");
    assertAddress(migrationLegacy, manifest.migration.legacyContract, "Legacy migration source");
    assertEqual(migrationSourceChain, BigInt(manifest.migration.sourceChainId), "Migration source chain");
    assertAddress(migrationOwner, manifest.deployment.owner, "Migration owner");
    assertAddress(universalRegistry, contracts.registry.address, "Universal resolver registry wiring");

    const expectedKind = manifest.settlement.kind === "native" ? 0 : 1;
    assertEqual(controllerSettlementKind, expectedKind, "Controller settlement kind");
    assertEqual(marketplaceSettlementKind, expectedKind, "Marketplace settlement kind");
    const expectedToken = manifest.settlement.tokenAddress ?? zeroAddress;
    assertAddress(controllerSettlementToken, expectedToken, "Controller settlement token");
    assertAddress(marketplaceSettlementToken, expectedToken, "Marketplace settlement token");

    const [
      collectionName,
      collectionSymbol,
      gracePeriod,
      annualPrice,
      oneCharacterQuote,
      twoCharacterQuote,
      threeCharacterQuote,
      standardQuote,
      referralRewardBps,
      minCommitmentAge,
      maxCommitmentAge,
      maxAttestationValidity,
      marketplaceFeeBps,
      minBidIncrementBps,
      antiSnipingWindow,
      extensionDuration,
      maxExtensions,
      migrationStartsAt,
      migrationEndsAt,
    ] = await Promise.all([
      publicClient.readContract({ ...contracts.registry, functionName: "name", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "symbol", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.registry, functionName: "gracePeriod", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "annualPrice", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "quote", args: ["a", 1], blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "quote", args: ["ab", 1], blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "quote", args: ["abc", 1], blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "quote", args: ["abcd", 1], blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "referralRewardBps", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "minCommitmentAge", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "maxCommitmentAge", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.controller, functionName: "maxNormalizationAttestationValidity", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "marketplaceFeeBps", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "minBidIncrementBps", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "antiSnipingWindow", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "extensionDuration", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.marketplace, functionName: "maxExtensions", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "migrationStartsAt", blockNumber: verificationBlockNumber }),
      publicClient.readContract({ ...contracts.migration, functionName: "migrationEndsAt", blockNumber: verificationBlockNumber }),
    ]);
    assertEqual(collectionName, manifest.collection.name, "Collection name");
    assertEqual(collectionSymbol, manifest.collection.symbol, "Collection symbol");
    assertEqual(gracePeriod, BigInt(manifest.gracePeriodSeconds), "Grace period");
    const expectedAnnualPrice = BigInt(manifest.pricing.annualPriceBaseUnits);
    assertEqual(annualPrice, expectedAnnualPrice, "Annual price");
    assertEqual(standardQuote, expectedAnnualPrice, "Standard annual quote");
    assertEqual(oneCharacterQuote, expectedAnnualPrice * BigInt(manifest.pricing.shortNamePriceMultipliers[0]), "One-character quote");
    assertEqual(twoCharacterQuote, expectedAnnualPrice * BigInt(manifest.pricing.shortNamePriceMultipliers[1]), "Two-character quote");
    assertEqual(threeCharacterQuote, expectedAnnualPrice * BigInt(manifest.pricing.shortNamePriceMultipliers[2]), "Three-character quote");
    assertEqual(referralRewardBps, manifest.pricing.referralRewardBps, "Referral BPS");
    assertEqual(minCommitmentAge, BigInt(manifest.commitment.minAgeSeconds), "Minimum commitment age");
    assertEqual(maxCommitmentAge, BigInt(manifest.commitment.maxAgeSeconds), "Maximum commitment age");
    assertEqual(maxAttestationValidity, BigInt(manifest.normalization.maxAttestationValiditySeconds), "Attestation validity");
    assertEqual(marketplaceFeeBps, manifest.pricing.marketplaceFeeBps, "Marketplace fee BPS");
    assertEqual(minBidIncrementBps, manifest.marketplace.minBidIncrementBps, "Minimum bid increment BPS");
    assertEqual(antiSnipingWindow, BigInt(manifest.marketplace.antiSnipingWindowSeconds), "Anti-sniping window");
    assertEqual(extensionDuration, BigInt(manifest.marketplace.extensionDurationSeconds), "Auction extension duration");
    assertEqual(maxExtensions, manifest.marketplace.maxExtensions, "Maximum auction extensions");
    if (manifest.migration.startsAt !== null) {
      assertEqual(migrationStartsAt, BigInt(manifest.migration.startsAt), "Migration start");
    }
    if (manifest.migration.endsAt !== null) {
      assertEqual(migrationEndsAt, BigInt(manifest.migration.endsAt), "Migration end");
    }

    if (manifest.settlement.kind === "erc20" && manifest.settlement.tokenAddress) {
      const erc20MetadataAbi = [
        { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
      ] as const;
      const [tokenCode, tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
        publicClient.getBytecode({ address: manifest.settlement.tokenAddress, blockNumber: verificationBlockNumber }),
        publicClient.readContract({ address: manifest.settlement.tokenAddress, abi: erc20MetadataAbi, functionName: "name", blockNumber: verificationBlockNumber }),
        publicClient.readContract({ address: manifest.settlement.tokenAddress, abi: erc20MetadataAbi, functionName: "symbol", blockNumber: verificationBlockNumber }),
        publicClient.readContract({ address: manifest.settlement.tokenAddress, abi: erc20MetadataAbi, functionName: "decimals", blockNumber: verificationBlockNumber }),
      ]);
      if (!tokenCode || tokenCode === "0x") throw new ManifestMismatchError("Settlement token has no bytecode.");
      assertEqual(tokenName, manifest.settlement.name, "Settlement token name");
      assertEqual(tokenSymbol, manifest.settlement.symbol, "Settlement token symbol");
      assertEqual(tokenDecimals, manifest.settlement.decimals, "Settlement token decimals");
    }
  } catch (error) {
    if (error instanceof ManifestMismatchError) throw error;
    throw new RpcUnavailableError();
  }

  return { manifest, origin, chain, publicClient, contracts, verificationBlockNumber };
}
