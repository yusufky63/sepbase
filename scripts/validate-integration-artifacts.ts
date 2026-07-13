import "./lib/load-env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress, parseUnits } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { agentIntegrationManifestSchema } from "../apps/web/lib/agent-manifest.schema";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import { isMainModule } from "./lib/is-main";

type AbiEntry = {
  type?: unknown;
  name?: unknown;
  stateMutability?: unknown;
};

type DeploymentRecord = {
  contract?: unknown;
  contractVersion?: unknown;
  deploymentBlock?: unknown;
  deployedAtTimestamp?: unknown;
  owner?: unknown;
  treasury?: unknown;
};

type V3TargetManifest = {
  chainId?: unknown;
  nativeCurrency?: { symbol?: unknown };
  suffix?: unknown;
  contracts?: Record<string, {
    address?: unknown;
    version?: unknown;
  }>;
  settlement?: {
    kind?: unknown;
    tokenAddress?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  };
  marketplace?: {
    maxPageSize?: unknown;
    maxPageScan?: unknown;
  };
  endpoints?: {
    accountApi?: unknown;
  };
  x402?: {
    network?: unknown;
    paymentAsset?: unknown;
    assetDecimals?: unknown;
    paidExecutionAvailable?: unknown;
  };
};

const requiredReadFunctions = [
  "VERSION",
  "annualPrice",
  "expiresAt",
  "fullName",
  "getListings",
  "isAvailable",
  "isSolvent",
  "listings",
  "marketplacePaused",
  "ownerOf",
  "primaryNameOf",
  "profileOf",
  "quote",
  "registrationsPaused",
  "reservedLabels",
  "resolve",
  "resolvedAddress",
  "settlementBalance",
  "statusOf",
  "totalProtectedLiability",
] as const;

const requiredMcpTools = [
  "resolve_name",
  "reverse_resolve",
  "check_availability",
  "name_info",
  "quote_registration",
  "market_listings",
  "protocol_health",
  "prepare_registration",
] as const;

const requiredV3Contracts = [
  "controller",
  "marketLens",
  "marketplace",
  "migration",
  "registry",
  "resolver",
  "universalResolver",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameAddress(left: unknown, right: unknown): boolean {
  return typeof left === "string"
    && typeof right === "string"
    && getAddress(left) === getAddress(right);
}

function sameNullableAddress(left: unknown, right: unknown): boolean {
  return (left === null && right === null) || sameAddress(left, right);
}

export async function validateIntegrationArtifacts(): Promise<void> {
  const root = process.cwd();
  const manifestPath = resolve(root, "apps/web/public/deployment-manifest.json");
  const abiPath = resolve(root, "apps/web/public/abi/ChainNameService.json");
  const agentManifestPath = resolve(root, "apps/web/public/agent-integration.json");
  const v3TargetManifestPath = resolve(root, "apps/web/public/deployment-manifest.v3.json");
  const llmsPath = resolve(root, "apps/web/public/llms.txt");
  const deploymentPath = resolve(root, `deployments/${projectConfig.chain.id}.json`);

  const manifestBytes = await readFile(manifestPath);
  const manifest = deploymentManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  const agentManifest = agentIntegrationManifestSchema.parse(
    JSON.parse(await readFile(agentManifestPath, "utf8")),
  );
  const v3TargetManifest = JSON.parse(
    await readFile(v3TargetManifestPath, "utf8"),
  ) as V3TargetManifest;
  const abiBytes = await readFile(abiPath);
  const abi = JSON.parse(abiBytes.toString("utf8")) as unknown;
  const llms = await readFile(llmsPath, "utf8");

  assert(Array.isArray(abi), "The public contract ABI must be a JSON array.");
  const abiSha256 = createHash("sha256").update(abiBytes).digest("hex");
  assert(manifest.abiSha256 === abiSha256, "Manifest abiSha256 does not match the served ABI bytes.");

  const readFunctions = new Set(
    (abi as AbiEntry[])
      .filter((entry) => entry.type === "function"
        && (entry.stateMutability === "view" || entry.stateMutability === "pure"))
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === "string"),
  );
  const missingReadFunctions = requiredReadFunctions.filter((name) => !readFunctions.has(name));
  assert(
    missingReadFunctions.length === 0,
    `Public ABI is missing agent/SDK read functions: ${missingReadFunctions.join(", ")}.`,
  );

  assert(manifest.chainId === projectConfig.chain.id, "Manifest chain ID does not match project config.");
  assert(manifest.chainName === projectConfig.chain.name, "Manifest chain name does not match project config.");
  assert(manifest.suffix === projectConfig.brand.suffix, "Manifest suffix does not match project config.");
  assert(
    manifest.requiredConfirmations === projectConfig.chain.requiredConfirmations,
    "Manifest confirmation count does not match project config.",
  );
  assert(
    manifest.nativeCurrency.name === projectConfig.chain.nativeCurrency.name
      && manifest.nativeCurrency.symbol === projectConfig.chain.nativeCurrency.symbol
      && manifest.nativeCurrency.decimals === projectConfig.chain.nativeCurrency.decimals,
    "Manifest native gas currency does not match project config.",
  );
  assert(
    manifest.settlement.kind === projectConfig.settlement.kind
      && manifest.settlement.name === projectConfig.settlement.name
      && manifest.settlement.symbol === projectConfig.settlement.symbol
      && manifest.settlement.decimals === projectConfig.settlement.decimals
      && (
        manifest.settlement.tokenAddress === projectConfig.settlement.tokenAddress
        || sameNullableAddress(manifest.settlement.tokenAddress, projectConfig.settlement.tokenAddress)
      ),
    "Manifest settlement asset does not match project config.",
  );
  assert(
    manifest.annualPriceBaseUnits
      === parseUnits(projectConfig.pricing.annual, projectConfig.settlement.decimals).toString(),
    "Manifest annual price does not match project config.",
  );
  assert(
    manifest.shortNamePriceMultipliers.join(",")
      === projectConfig.pricing.shortNameMultipliers.join(","),
    "Manifest short-name multipliers do not match project config.",
  );
  assert(manifest.docsUrl === projectConfig.integration.docsPath, "Manifest docs URL is stale.");
  assert(manifest.nameApiUrl === projectConfig.integration.nameApiPath, "Manifest name API URL is stale.");
  assert(manifest.resolveApiUrl === projectConfig.integration.resolveApiPath, "Manifest resolve API URL is stale.");
  assert(manifest.reverseApiUrl === projectConfig.integration.reverseApiPath, "Manifest reverse API URL is stale.");
  assert(manifest.marketApiUrl === projectConfig.integration.marketApiPath, "Manifest market API URL is stale.");
  assert(manifest.openApiUrl === projectConfig.integration.openApiPath, "Manifest OpenAPI URL is stale.");
  assert(agentManifest.protocol.chainId === manifest.chainId, "Agent manifest chain ID is stale.");
  assert(agentManifest.protocol.chainName === manifest.chainName, "Agent manifest chain name is stale.");
  assert(agentManifest.protocol.testnet === manifest.testnet, "Agent manifest testnet flag is stale.");
  assert(
    sameNullableAddress(agentManifest.protocol.contract, manifest.contract),
    "Agent manifest contract is stale.",
  );
  assert(agentManifest.protocol.suffix === manifest.suffix, "Agent manifest suffix is stale.");
  assert(agentManifest.schemaVersion === 4, "Agent manifest schema version is stale.");
  assert(
    agentManifest.discovery.deploymentManifest === projectConfig.integration.wellKnownPath,
    "Agent manifest deployment discovery URL is stale.",
  );
  assert(
    agentManifest.discovery.v3TargetManifest === "/deployment-manifest.v3.json",
    "Agent manifest V3 target discovery URL is stale.",
  );
  assert(
    agentManifest.discovery.v3Status === "/api/v3/status"
      && agentManifest.discovery.v3Name === "/api/v3/name/{label}"
      && agentManifest.discovery.v3Market === "/api/v3/market"
      && agentManifest.discovery.v3Health === "/api/v3/health"
      && agentManifest.discovery.v3Mcp === "/api/v3/mcp"
      && agentManifest.discovery.v3NormalizationAttestation === "/api/v3/normalization-attestation"
      && agentManifest.discovery.v3Account === "/api/v3/account/{address}",
    "Agent manifest V3 API discovery URLs are stale.",
  );
  assert(
    agentManifest.discovery.openApi === projectConfig.integration.openApiPath,
    "Agent manifest OpenAPI discovery URL is stale.",
  );
  assert(
    agentManifest.discovery.documentation === projectConfig.integration.docsPath,
    "Agent manifest documentation URL is stale.",
  );
  assert(agentManifest.discovery.llms === "/llms.txt", "Agent manifest llms.txt URL is stale.");
  assert(agentManifest.mcp.endpoint === projectConfig.integration.mcpPath, "Agent manifest MCP URL is stale.");
  assert(
    agentManifest.mcp.protocolVersion === "2025-11-25"
      && agentManifest.mcp.requestOriginPolicy === "configured-origin-or-no-origin",
    "Agent manifest MCP protocol or Origin policy is stale.",
  );
  assert(
    requiredMcpTools.every((tool) => agentManifest.mcp.tools.includes(tool))
      && agentManifest.mcp.tools.length === requiredMcpTools.length,
    "Agent manifest MCP tool inventory is incomplete or contains an undeclared tool.",
  );
  assert(
    agentManifest.x402.quoteEndpoint === projectConfig.integration.x402QuotePath,
    "Agent manifest x402 quote URL is stale.",
  );
  assert(
    agentManifest.x402.resourceEndpoint === projectConfig.integration.x402RegisterPath,
    "Agent manifest x402 registration URL is stale.",
  );
  assert(
    agentManifest.x402.statusEndpoint === "/api/x402/registration/status",
    "Agent manifest x402 status URL is stale.",
  );
  assert(
    agentManifest.x402.availability === "fail-closed"
      && agentManifest.x402.implementationStatus === "activation-gated"
      && agentManifest.x402.paidExecutionAvailable === false,
    "Agent manifest must fail closed about the activation-gated paid x402 runtime.",
  );
  assert(
    agentManifest.x402.pinnedPackages["@x402/core"] === "2.18.0"
      && agentManifest.x402.pinnedPackages["@x402/evm"] === "2.18.0"
      && agentManifest.x402.pinnedPackages["@x402/extensions"] === "2.18.0"
      && agentManifest.x402.pinnedPackages.workflow === "4.6.0",
    "Agent manifest x402 and Workflow package pins are stale.",
  );
  assert(
    agentManifest.x402.registrationScope.includes("quoteId")
      && agentManifest.x402.registrationScope.includes("resource")
      && agentManifest.x402.paymentAcceptanceScope.includes("asset")
      && agentManifest.x402.paymentAcceptanceScope.includes("payTo")
      && agentManifest.x402.idempotencyScope.includes("paymentIdentifier")
      && agentManifest.x402.idempotencyScope.includes("requestFingerprint"),
    "Agent manifest x402 registration, payment, or idempotency scope is incomplete.",
  );

  assert(
    v3TargetManifest.chainId === manifest.chainId,
    "V3 target manifest chain ID does not match the current deployment manifest.",
  );
  assert(
    v3TargetManifest.suffix === manifest.suffix,
    "V3 target manifest suffix does not match the current deployment manifest.",
  );
  assert(
    v3TargetManifest.endpoints?.accountApi === "/api/v3/account/{address}",
    "V3 target manifest account API discovery URL is stale.",
  );
  assert(
    typeof v3TargetManifest.contracts === "object" && v3TargetManifest.contracts !== null,
    "V3 target manifest contract inventory is missing.",
  );
  const v3ContractKeys = Object.keys(v3TargetManifest.contracts).sort();
  assert(
    v3ContractKeys.join(",") === [...requiredV3Contracts].sort().join(","),
    "V3 target manifest must expose exactly six authority/state contracts plus MarketLens.",
  );
  assert(
    requiredV3Contracts.every((key) => v3TargetManifest.contracts?.[key]?.version === "3.0.0"),
    "V3 target manifest contract versions are incomplete or stale.",
  );
  assert(
    v3TargetManifest.marketplace?.maxPageSize === 50
      && v3TargetManifest.marketplace.maxPageScan === 100,
    "V3 MarketLens page or raw-scan bounds are stale.",
  );
  assert(
    v3TargetManifest.settlement?.kind === "erc20"
      && typeof v3TargetManifest.settlement.tokenAddress === "string"
      && typeof v3TargetManifest.settlement.symbol === "string"
      && v3TargetManifest.settlement.decimals === 6,
    "V3 target manifest must declare a standard six-decimal ERC-20 settlement asset.",
  );
  assert(
    v3TargetManifest.x402?.network === `eip155:${manifest.chainId}`
      && sameAddress(
        v3TargetManifest.x402.paymentAsset,
        v3TargetManifest.settlement.tokenAddress,
      )
      && v3TargetManifest.x402.assetDecimals === v3TargetManifest.settlement.decimals
      && v3TargetManifest.x402.paidExecutionAvailable === false,
    "V3 target manifest x402 settlement metadata is inconsistent or not fail-closed.",
  );
  assert(
    agentManifest.x402.settlementTarget.network === v3TargetManifest.x402.network
      && sameAddress(
        agentManifest.x402.settlementTarget.asset,
        v3TargetManifest.settlement.tokenAddress,
      )
      && agentManifest.x402.settlementTarget.symbol === v3TargetManifest.settlement.symbol
      && agentManifest.x402.settlementTarget.decimals === v3TargetManifest.settlement.decimals
      && agentManifest.x402.settlementTarget.gasCurrency === v3TargetManifest.nativeCurrency?.symbol
      && agentManifest.x402.settlementTarget.testnetValueDisclaimer,
    "Agent manifest x402 target does not match the V3 draft manifest.",
  );
  assert(
    agentManifest.x402.activationRequirements.includes("official-x402-v2-runtime")
      && agentManifest.x402.activationRequirements.includes("durable-payment-idempotency")
      && agentManifest.x402.activationRequirements.includes("durable-commit-reveal-workflow")
      && agentManifest.x402.activationRequirements.includes("monitoring-reconciliation-refund-e2e"),
    "Agent manifest x402 activation requirements are incomplete.",
  );

  for (const requiredLink of [
    projectConfig.integration.docsPath,
    projectConfig.integration.wellKnownPath,
    "/deployment-manifest.v3.json",
    manifest.abiUrl,
    projectConfig.integration.openApiPath,
    projectConfig.integration.agentManifestPath,
    projectConfig.integration.mcpPath,
    projectConfig.integration.x402QuotePath,
    projectConfig.integration.x402RegisterPath,
    "/api/x402/registration/status",
    "/api/v3/account/{address}",
    "/api/v3/market",
    "/api/v3/mcp",
    "/security",
    "/privacy",
  ]) {
    assert(llms.includes(`](${requiredLink})`), `llms.txt is missing canonical link ${requiredLink}.`);
  }
  assert(
    llms.includes("activation-gated")
      && llms.includes("ChainNameMarketLensV3")
      && llms.includes("50-result/100-scan"),
    "llms.txt is missing the V3 x402 or bounded MarketLens status.",
  );

  if (manifest.contract !== null) {
    const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as DeploymentRecord;
    assert(sameAddress(deployment.contract, manifest.contract), "Deployment record contract does not match manifest.");
    assert(deployment.contractVersion === manifest.contractVersion, "Deployment record version does not match manifest.");
    assert(deployment.deploymentBlock === manifest.deploymentBlock, "Deployment block does not match manifest.");
    assert(sameAddress(deployment.owner, manifest.owner), "Deployment owner does not match manifest.");
    assert(sameAddress(deployment.treasury, manifest.treasury), "Deployment treasury does not match manifest.");
    assert(
      typeof deployment.deployedAtTimestamp === "string"
        && new Date(Number(deployment.deployedAtTimestamp) * 1_000).toISOString() === manifest.deployedAt,
      "Deployment timestamp does not match manifest.",
    );
  }
}

if (isMainModule(import.meta.url)) {
  await validateIntegrationArtifacts();
  console.log("Validated local deployment/agent manifests, ABI, llms.txt, and deployment record without network access.");
}
