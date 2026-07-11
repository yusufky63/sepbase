import "./lib/load-env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, getAddress, http, parseAbi, parseUnits, zeroAddress } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import { annualPriceForLength } from "../apps/web/lib/pricing";
import { isMainModule } from "./lib/is-main";

const deploymentAbi = parseAbi([
  "function VERSION() view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function suffix() view returns (string)",
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function gracePeriod() view returns (uint64)",
  "function settlementKind() view returns (uint8)",
  "function settlementToken() view returns (address)",
  "function annualPrice() view returns (uint256)",
  "function referralRewardBps() view returns (uint16)",
  "function marketplaceFeeBps() view returns (uint16)",
  "function metadataBaseURI() view returns (string)",
  "function quote(string label, uint8 durationYears) view returns (uint256)",
]);

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
}

export async function checkDeployment(): Promise<void> {
  const manifestPath = resolve(process.cwd(), "apps/web/public/deployment-manifest.json");
  const manifest = deploymentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (!manifest.contract) throw new Error("Deployment manifest does not contain a contract address.");
  const address = getAddress(manifest.contract);
  const client = createPublicClient({ transport: http(projectConfig.chain.rpcUrl, { timeout: 20_000 }) });
  const read = <T>(functionName: string) => client.readContract({
    address,
    abi: deploymentAbi,
    functionName: functionName as never,
  }) as Promise<T>;
  const readQuote = (label: string) => client.readContract({
    address,
    abi: deploymentAbi,
    functionName: "quote",
    args: [label, 1],
  });

  const [
    bytecode,
    chainId,
    version,
    collectionName,
    collectionSymbol,
    suffix,
    owner,
    treasury,
    gracePeriod,
    settlementKind,
    settlementToken,
    annualPrice,
    referralRewardBps,
    marketplaceFeeBps,
    metadataBaseURI,
    oneCharacterQuote,
    twoCharacterQuote,
    threeCharacterQuote,
    standardQuote,
    multicallBytecode,
  ] = await Promise.all([
    client.getBytecode({ address }),
    client.getChainId(),
    read<string>("VERSION"),
    read<string>("name"),
    read<string>("symbol"),
    read<string>("suffix"),
    read<`0x${string}`>("owner"),
    read<`0x${string}`>("treasury"),
    read<bigint>("gracePeriod"),
    read<number>("settlementKind"),
    read<`0x${string}`>("settlementToken"),
    read<bigint>("annualPrice"),
    read<number>("referralRewardBps"),
    read<number>("marketplaceFeeBps"),
    read<string>("metadataBaseURI"),
    readQuote("a"),
    readQuote("aa"),
    readQuote("aaa"),
    readQuote("aaaa"),
    client.getBytecode({ address: getAddress(manifest.multicall3.address) }),
  ]);

  if (!bytecode || bytecode === "0x") throw new Error("Deployment contract has no runtime bytecode.");
  assertEqual(chainId, projectConfig.chain.id, "Chain ID");
  assertEqual(version, manifest.contractVersion, "Contract version");
  assertEqual(collectionName, projectConfig.collection.name, "Collection name");
  assertEqual(collectionSymbol, projectConfig.collection.symbol, "Collection symbol");
  assertEqual(suffix, projectConfig.brand.suffix, "Suffix");
  assertEqual(getAddress(owner), getAddress(manifest.owner ?? ""), "Owner");
  assertEqual(getAddress(treasury), getAddress(manifest.treasury ?? ""), "Treasury");
  assertEqual(gracePeriod, BigInt(manifest.gracePeriodSeconds), "Grace period");
  assertEqual(settlementKind, projectConfig.settlement.kind === "native" ? 0 : 1, "Settlement kind");
  assertEqual(
    getAddress(settlementToken),
    projectConfig.settlement.kind === "native" ? zeroAddress : getAddress(projectConfig.settlement.tokenAddress),
    "Settlement token",
  );
  assertEqual(
    annualPrice,
    parseUnits(projectConfig.pricing.annual, projectConfig.settlement.decimals),
    "Annual price",
  );
  assertEqual(referralRewardBps, projectConfig.referrals.rewardBps, "Referral reward BPS");
  assertEqual(marketplaceFeeBps, projectConfig.marketplace.feeBps, "Marketplace fee BPS");
  assertEqual(metadataBaseURI, manifest.metadataBaseURI, "Metadata base URI");
  const standardAnnualPrice = parseUnits(projectConfig.pricing.annual, projectConfig.settlement.decimals);
  assertEqual(
    oneCharacterQuote,
    annualPriceForLength(standardAnnualPrice, 1, projectConfig.pricing.shortNameMultipliers),
    "One-character annual quote",
  );
  assertEqual(
    twoCharacterQuote,
    annualPriceForLength(standardAnnualPrice, 2, projectConfig.pricing.shortNameMultipliers),
    "Two-character annual quote",
  );
  assertEqual(
    threeCharacterQuote,
    annualPriceForLength(standardAnnualPrice, 3, projectConfig.pricing.shortNameMultipliers),
    "Three-character annual quote",
  );
  assertEqual(standardQuote, standardAnnualPrice, "Standard annual quote");
  if (!multicallBytecode || multicallBytecode === "0x") {
    throw new Error("Configured Multicall3 address has no runtime bytecode.");
  }
  console.log(`Deployment OK: ${address}, version ${version}, block ${manifest.deploymentBlock}.`);
}

if (isMainModule(import.meta.url)) await checkDeployment();
