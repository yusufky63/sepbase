import "./lib/load-env";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAddress, parseUnits } from "viem";
import { projectConfig } from "../apps/web/config/project.config";
import { agentIntegrationManifestSchema } from "../apps/web/lib/agent-manifest.schema";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import {
  COMPILED_X402_RUNTIME_CAPABILITIES,
  x402RegistrationReadiness,
} from "../apps/web/lib/x402/config";
import { v3X402DeploymentProfile } from "../apps/web/lib/x402/deployment-profile";
import { parseV3SuiteManifest } from "../packages/sdk/src/v3-manifest.js";
import { isMainModule } from "./lib/is-main";

type DeploymentRecord = {
  contract?: string;
  contractVersion?: string;
  deploymentBlock?: string;
  deployedAt?: string;
  deployedAtTimestamp?: string;
  owner?: string;
  treasury?: string;
};

type V3TargetManifest = {
  chainId?: unknown;
  nativeCurrency?: { symbol?: unknown };
  settlement?: {
    kind?: unknown;
    tokenAddress?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  };
};

function readV3SettlementTarget(value: V3TargetManifest) {
  if (
    typeof value.chainId !== "number"
    || typeof value.nativeCurrency?.symbol !== "string"
    || value.settlement?.kind !== "erc20"
    || typeof value.settlement.tokenAddress !== "string"
    || typeof value.settlement.symbol !== "string"
    || value.settlement.decimals !== 6
  ) {
    throw new Error("The V3 draft manifest does not contain the required six-decimal ERC-20 x402 target.");
  }
  return {
    network: `eip155:${value.chainId}`,
    asset: getAddress(value.settlement.tokenAddress),
    symbol: value.settlement.symbol,
    decimals: value.settlement.decimals,
    gasCurrency: value.nativeCurrency.symbol,
  };
}

function configuredSourceCommit(): string | null {
  const configured = [
    ["SOURCE_COMMIT", process.env.SOURCE_COMMIT],
    ["VERCEL_GIT_COMMIT_SHA", process.env.VERCEL_GIT_COMMIT_SHA],
    ["GITHUB_SHA", process.env.GITHUB_SHA],
  ] as const;
  const entry = configured.find(([, value]) => value?.trim());
  if (!entry) return null;
  const [name, value] = entry;
  const candidate = value?.trim().toLowerCase() ?? "";
  if (!/^[a-f0-9]{40}$/.test(candidate)) {
    throw new Error(`${name} must be a full 40-character hexadecimal source commit.`);
  }
  return candidate;
}

async function optionalDeployment(path: string): Promise<DeploymentRecord | null> {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8")) as DeploymentRecord;
  } catch {
    return null;
  }
}

export async function generateManifest(): Promise<void> {
  const root = process.cwd();
  const v3TargetManifestPath = resolve(root, "apps/web/public/deployment-manifest.v3.json");
  const v3TargetManifest = JSON.parse(
    await readFile(v3TargetManifestPath, "utf8"),
  ) as V3TargetManifest;
  const parsedV3Manifest = parseV3SuiteManifest(v3TargetManifest);
  const v3SettlementTarget = readV3SettlementTarget(v3TargetManifest);
  const x402Readiness = x402RegistrationReadiness(
    v3X402DeploymentProfile(parsedV3Manifest),
    process.env,
    COMPILED_X402_RUNTIME_CAPABILITIES,
  );
  const abiPath = resolve(root, "apps/web/public/abi/ChainNameService.json");
  let abiSha256: string | null = null;
  try {
    const abi = await readFile(abiPath);
    abiSha256 = createHash("sha256").update(abi).digest("hex");
  } catch {
    // A pre-deployment manifest is valid before the first contract build.
  }

  const deploymentPath = resolve(root, `deployments/${projectConfig.chain.id}.json`);
  const deployment = await optionalDeployment(deploymentPath);
  const currentDeployment = deployment?.contractVersion === "2.0.0" ? deployment : null;
  const normalized = (value: string | undefined): `0x${string}` | null =>
    value ? getAddress(value) : null;
  const annualPrice = parseUnits(projectConfig.pricing.annual, projectConfig.settlement.decimals);
  const metadataBaseURI = new URL(projectConfig.integration.metadataPath, projectConfig.siteUrl).href;
  const gitCommit = configuredSourceCommit();
  const deployedAt = currentDeployment?.deployedAt
    ?? (currentDeployment?.deployedAtTimestamp
      ? new Date(Number(currentDeployment.deployedAtTimestamp) * 1000).toISOString()
      : null);

  const manifest = deploymentManifestSchema.parse({
    schemaVersion: 3,
    contractVersion: "2.0.0",
    abiSha256,
    chainId: projectConfig.chain.id,
    chainName: projectConfig.chain.name,
    testnet: projectConfig.chain.testnet,
    requiredConfirmations: projectConfig.chain.requiredConfirmations,
    nativeCurrency: projectConfig.chain.nativeCurrency,
    multicall3: projectConfig.chain.multicall3,
    suffix: projectConfig.brand.suffix,
    nameRules: {
      minLength: projectConfig.names.minLength,
      maxLength: projectConfig.names.maxLength,
      allowedYears: projectConfig.names.allowedYears,
    },
    collection: projectConfig.collection,
    contract: normalized(currentDeployment?.contract),
    deploymentBlock: currentDeployment?.deploymentBlock ?? null,
    deployedAt,
    owner: normalized(currentDeployment?.owner),
    treasury: normalized(currentDeployment?.treasury),
    settlement: projectConfig.settlement,
    annualPriceBaseUnits: annualPrice.toString(),
    shortNamePriceMultipliers: projectConfig.pricing.shortNameMultipliers,
    referenceFiat: projectConfig.pricing.referenceFiat,
    gracePeriodSeconds: (BigInt(projectConfig.names.gracePeriodDays) * 86_400n).toString(),
    referralRewardBps: projectConfig.referrals.rewardBps,
    referralAttributionSeconds: (BigInt(projectConfig.referrals.attributionDays) * 86_400n).toString(),
    marketplaceFeeBps: projectConfig.marketplace.feeBps,
    metadataBaseURI,
    rpcUrl: projectConfig.chain.rpcUrl,
    explorerUrl: projectConfig.chain.explorerUrl,
    abiUrl: "/abi/ChainNameService.json",
    docsUrl: projectConfig.integration.docsPath,
    nameApiUrl: projectConfig.integration.nameApiPath,
    resolveApiUrl: projectConfig.integration.resolveApiPath,
    reverseApiUrl: projectConfig.integration.reverseApiPath,
    marketApiUrl: projectConfig.integration.marketApiPath,
    openApiUrl: projectConfig.integration.openApiPath,
    solidityVersion: "0.8.36",
    openzeppelinVersion: "5.4.0",
    gitCommit,
  });

  const manifestPath = resolve(root, "apps/web/public/deployment-manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const agentManifest = agentIntegrationManifestSchema.parse({
    schemaVersion: 4,
    kind: "sepbase-agent-integration",
    name: `${projectConfig.brand.name} agent integration`,
    description: x402Readiness.ready
      ? "Machine-readable discovery for read-only MCP tools, guarded transaction preparation, and the operational paid V3 x402 runtime."
      : "Machine-readable discovery for read-only MCP tools, guarded transaction preparation, and an activation-gated paid x402 runtime that remains fail-closed until the live V3 release and external capabilities are verified.",
    protocol: {
      chainId: manifest.chainId,
      chainName: manifest.chainName,
      testnet: manifest.testnet,
      suffix: manifest.suffix,
      contract: manifest.contract,
    },
    discovery: {
      deploymentManifest: projectConfig.integration.wellKnownPath,
      v3TargetManifest: "/deployment-manifest.v3.json",
      v3Status: "/api/v3/status",
      v3Name: "/api/v3/name/{label}",
      v3Market: "/api/v3/market",
      v3Health: "/api/v3/health",
      v3Mcp: "/api/v3/mcp",
      v3NormalizationAttestation: "/api/v3/normalization-attestation",
      v3Account: "/api/v3/account/{address}",
      openApi: projectConfig.integration.openApiPath,
      documentation: projectConfig.integration.docsPath,
      llms: "/llms.txt",
    },
    mcp: {
      endpoint: projectConfig.integration.mcpPath,
      protocolVersion: "2025-11-25",
      transport: "streamable-http",
      sessionMode: "stateless",
      authentication: "none",
      requestOriginPolicy: "configured-origin-or-no-origin",
      transactionAuthority: "none",
      tools: [
        "resolve_name",
        "reverse_resolve",
        "check_availability",
        "name_info",
        "quote_registration",
        "market_listings",
        "protocol_health",
        "prepare_registration",
      ],
    },
    x402: {
      specVersion: 2,
      availability: x402Readiness.ready ? "available" : "fail-closed",
      implementationStatus: x402Readiness.implementationStatus,
      paidExecutionAvailable: x402Readiness.ready,
      pinnedPackages: {
        "@x402/core": "2.18.0",
        "@x402/evm": "2.18.0",
        "@x402/extensions": "2.18.0",
        workflow: "4.6.0",
      },
      settlementTarget: {
        status: parsedV3Manifest.releaseStatus === "live" ? "live" : "v3-target",
        kind: "erc20",
        ...v3SettlementTarget,
        testnetValueDisclaimer: true,
      },
      quoteEndpoint: projectConfig.integration.x402QuotePath,
      resourceEndpoint: projectConfig.integration.x402RegisterPath,
      statusEndpoint: "/api/x402/registration/status",
      defaultEnabled: false,
      registrationMode: "optional-keeper-mediated",
      paymentRequiredHeader: "PAYMENT-REQUIRED",
      paymentSignatureHeader: "PAYMENT-SIGNATURE",
      paymentResponseHeader: "PAYMENT-RESPONSE",
      registrationScope: [
        "chainId",
        "network",
        "contract",
        "resource",
        "quoteId",
        "label",
        "recipient",
        "durationYears",
        "referrer",
        "expectedAmountBaseUnits",
        "expectedReferralRewardBps",
        "expiresAt",
      ],
      paymentAcceptanceScope: [
        "x402Version",
        "scheme",
        "network",
        "asset",
        "amountBaseUnits",
        "payTo",
      ],
      idempotencyScope: [
        "paymentIdentifier",
        "requestFingerprint",
        "quoteId",
      ],
      activationRequirements: [
        "v3-commit-reveal-deployment",
        "matching-six-decimal-erc20",
        "official-x402-v2-runtime",
        "reviewed-facilitator",
        "authenticated-quote-and-attestation",
        "durable-payment-idempotency",
        "managed-limited-keeper",
        "durable-commit-reveal-workflow",
        "runtime-quote-revalidation",
        "monitoring-reconciliation-refund-e2e",
      ],
    },
  });
  await writeFile(
    resolve(root, "apps/web/public/agent-integration.json"),
    `${JSON.stringify(agentManifest, null, 2)}\n`,
    "utf8",
  );

  const llms = `# ${projectConfig.brand.name}\n\n> Independent .${projectConfig.brand.suffix} names on ${projectConfig.chain.name} with manifest-first SDK, HTTP API, verified identity reads, MCP tools, and an activation-gated paid x402 runtime.\n\n## Integration\n\n- [Developer documentation](${projectConfig.integration.docsPath}): SDK, React, API, MCP, x402, and guarded write examples.\n- [Deployment manifest](${projectConfig.integration.wellKnownPath}): Canonical chain, contract, asset, and endpoint discovery.\n- [V3 target manifest](/deployment-manifest.v3.json): Draft seven-address target including MarketLens and ERC-20/x402 metadata; not deployment or live evidence.\n- [Agent discovery](${projectConfig.integration.agentManifestPath}): MCP endpoint, tool inventory, x402 endpoints, implementation status, and trust boundaries.\n- [MCP Streamable HTTP endpoint](${projectConfig.integration.mcpPath}): Stateless public reads and unsigned transaction preparation.\n- [x402 registration quote](${projectConfig.integration.x402QuotePath}): Free, short-lived canonical registration scope and current protocol quote.\n- [x402 paid registration resource](${projectConfig.integration.x402RegisterPath}): Official x402 V2 negotiation and durable V3 commit/reveal execution when discovery reports availability.\n- [Contract ABI](/abi/ChainNameService.json): ABI bytes verified by the manifest SHA-256 checksum.\n- [OpenAPI](${projectConfig.integration.openApiPath}): HTTP API contract, including agent-facing routes.\n- [Security](/security): Responsible disclosure and execution trust boundaries.\n- [Privacy](/privacy): Public-chain, browser-local, RPC, and agent data handling.\n- [Blockscout handoff](/integrations/blockscout-bens.md): External BENS integration prerequisites and semantics.\n\nLoad and validate the deployment manifest before use. Never hardcode chain IDs, suffixes, contract or token addresses, native currency, settlement symbol, base-unit precision, or token decimals. MCP never signs or broadcasts. Paid x402 source is activation-gated: official x402 2.18.0, encrypted CAS idempotency, managed signing, on-chain calldata/receipt reconciliation, and Workflow 4.6.0 continuation are wired, but the route still fails closed until a live paid-enabled V3 manifest and every server-only external capability are verified. The V3 Base Sepolia target uses manifest-verified ${v3SettlementTarget.symbol} ${v3SettlementTarget.asset} (${v3SettlementTarget.decimals} decimals, ${v3SettlementTarget.network}); gas remains separate ${v3SettlementTarget.gasCurrency}, test assets have no guaranteed fiat value, and live V2 remains native.\n\nThe pending V3 release has seven addresses: six authority/state contracts plus bounded read-only ChainNameMarketLensV3. The lens is not authority or an indexer. Pin pages to one block, respect 50-result/100-scan bounds, follow raw cursors, deduplicate object IDs, treat stale flags as projections, and revalidate marketplace/registry state before writes. This target is not deployed or live without manifest, ABI, acceptance and final-origin evidence.\n`;
  const llmsWithV3Api = llms.replace(
    "- [Agent discovery]",
    "- [V3 release status](/api/v3/status): Draft/candidate/live suite state, seven-contract inventory, wiring and capabilities.\n- [V3 read API](/api/v3/name/{label}): ENSIP-15 name state; resolve, reverse, MarketLens and health routes are in OpenAPI and fail closed while the suite is draft.\n- [V3 account API](/api/v3/account/{address}): Bounded owner enumeration, balances, primary identity and buyer/owner offer pages pinned to one block.\n- [V3 normalization attestation](/api/v3/normalization-attestation): Same-origin, candidate/live-only proxy to a reviewed external issuer; draft state returns 503 before issuer configuration or I/O.\n- [V3 MCP](/api/v3/mcp): Opt-in read and unsigned-plan tools; registration remains requirements-only and accepts no secret, signature, wallet credential or payment payload.\n- [Agent discovery]",
  );
  const llmsWithAllMachineRoutes = llmsWithV3Api
    .replace(
      "- [x402 registration quote]",
      "- [V3 MarketLens API](/api/v3/market): Block-pinned fixed listing, offer, and auction pages with bounded raw cursor semantics.\n- [x402 registration quote]",
    )
    .replace(
      "- [Contract ABI]",
      "- [x402 paid order status](/api/x402/registration/status): Reconcile a non-secret paymentIdentifier + planId after client timeout without paying again.\n- [Contract ABI]",
    );
  await writeFile(
    resolve(root, "apps/web/public/llms.txt"),
    llmsWithAllMachineRoutes,
    "utf8",
  );
}

if (isMainModule(import.meta.url)) {
  await generateManifest();
  console.log("Generated deployment manifest, agent discovery, and llms.txt.");
}
