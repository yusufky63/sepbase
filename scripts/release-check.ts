import "./lib/load-env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectConfig } from "../apps/web/config/project.config";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import { parseV3SuiteManifest } from "../packages/sdk/src/v3-manifest.js";
import {
  COMPILED_X402_RUNTIME_CAPABILITIES,
  x402RegistrationReadiness,
} from "../apps/web/lib/x402/config";
import { v3X402DeploymentProfile } from "../apps/web/lib/x402/deployment-profile";
import {
  MAX_QUOTE_TTL_SECONDS,
  MIN_QUOTE_TTL_SECONDS,
  X402_PAID_EXECUTION_IMPLEMENTED,
} from "../apps/web/lib/x402/constants";
import { isMainModule } from "./lib/is-main";

export type ReleaseGateInput = {
  explicitSiteUrl: string | undefined;
  publicRpcUrl: string;
  serverRpcUrl: string | undefined;
  walletConnectProjectId: string | undefined;
  metadataBaseURI: string;
  expectedMetadataBaseURI: string;
  contract: string | null;
  settlementKind: "native" | "erc20";
  settlementTokenAddress: string | null;
  x402RegistrationEnabled: string | undefined;
  x402FacilitatorUrl: string | undefined;
  x402PayToAddress: string | undefined;
  x402PaymentAssetAddress: string | undefined;
  x402KeeperAddress: string | undefined;
  x402KeeperSignerProvider: string | undefined;
  x402IdempotencyStoreUrl: string | undefined;
  x402KeeperPrivateKey: string | undefined;
  x402QuoteTtlSeconds: string | undefined;
  x402PaidExecutionImplemented: boolean;
  x402ReadinessBlockers?: string[];
};

const nonZeroAddress = /^0x(?!0{40}$)[a-fA-F0-9]{40}$/;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requireHostedUrl(issues: string[], name: string, value: string | undefined) {
  if (!value?.trim()) {
    issues.push(`${name} is required when x402 registration is enabled.`);
    return;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") issues.push(`${name} must use HTTPS for a hosted release.`);
    if (loopbackHosts.has(url.hostname)) {
      issues.push(`${name} must not use a loopback host for a hosted release.`);
    }
    if (url.username || url.password || url.search || url.hash) {
      issues.push(`${name} must not embed credentials, query parameters, or fragments.`);
    }
  } catch {
    issues.push(`${name} must be a valid absolute URL.`);
  }
}

function requireAddress(issues: string[], name: string, value: string | undefined) {
  if (!value?.trim()) {
    issues.push(`${name} is required when x402 registration is enabled.`);
  } else if (!nonZeroAddress.test(value.trim())) {
    issues.push(`${name} must be a non-zero EVM address.`);
  }
}

function requireDurableStoreUrl(issues: string[], value: string | undefined) {
  if (!value?.trim()) {
    issues.push("X402_IDEMPOTENCY_STORE_URL is required when x402 registration is enabled.");
    return;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "rediss:") {
      issues.push("X402_IDEMPOTENCY_STORE_URL must use HTTPS or TLS Redis (rediss).");
    }
    if (loopbackHosts.has(url.hostname)) {
      issues.push("X402_IDEMPOTENCY_STORE_URL must not use a loopback host for a hosted release.");
    }
  } catch {
    issues.push("X402_IDEMPOTENCY_STORE_URL must be a valid absolute URL.");
  }
}

function validateQuoteTtl(issues: string[], value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return;
  if (!/^\d+$/.test(raw)) {
    issues.push("X402_QUOTE_TTL_SECONDS must be an integer number of seconds.");
    return;
  }
  const seconds = Number(raw);
  if (
    !Number.isSafeInteger(seconds)
    || seconds < MIN_QUOTE_TTL_SECONDS
    || seconds > MAX_QUOTE_TTL_SECONDS
  ) {
    issues.push(
      `X402_QUOTE_TTL_SECONDS must be between ${MIN_QUOTE_TTL_SECONDS} and ${MAX_QUOTE_TTL_SECONDS} seconds.`,
    );
  }
}

export function collectReleaseGateIssues(input: ReleaseGateInput) {
  const issues: string[] = [];
  const siteUrl = input.explicitSiteUrl?.trim();
  if (!siteUrl) {
    issues.push("NEXT_PUBLIC_SITE_URL must be set explicitly.");
  } else {
    try {
      const site = new URL(siteUrl);
      if (site.protocol !== "https:") issues.push("NEXT_PUBLIC_SITE_URL must use HTTPS.");
      if (loopbackHosts.has(site.hostname)) {
        issues.push("NEXT_PUBLIC_SITE_URL must use the final public hostname.");
      }
      if (site.pathname !== "/" || site.search || site.hash || site.username || site.password) {
        issues.push("NEXT_PUBLIC_SITE_URL must be a credential-free site origin without path, query, or fragment.");
      }
    } catch {
      issues.push("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
    }
  }

  const serverRpcUrl = input.serverRpcUrl?.trim();
  if (!serverRpcUrl) {
    issues.push("RPC_URL must provide a server-only production RPC endpoint.");
  } else {
    try {
      const rpc = new URL(serverRpcUrl);
      if (rpc.protocol !== "https:") issues.push("RPC_URL must use HTTPS for a hosted release.");
      if (loopbackHosts.has(rpc.hostname)) {
        issues.push("RPC_URL must not use a loopback host for a hosted release.");
      }
      if (rpc.username || rpc.password || rpc.hash) {
        issues.push("RPC_URL must not embed credentials or fragments.");
      }
      try {
        const publicRpc = new URL(input.publicRpcUrl.trim());
        if (rpc.origin === publicRpc.origin) {
          issues.push("RPC_URL must use a separate provider origin from the browser-visible public RPC URL.");
        }
      } catch {
        issues.push("The browser-visible public RPC URL must be a valid absolute URL.");
      }
    } catch {
      issues.push("RPC_URL must be a valid absolute URL.");
    }
  }

  if (!input.walletConnectProjectId?.trim()) {
    issues.push("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required for production mobile wallet coverage.");
  }
  if (!input.contract) issues.push("The deployment manifest must contain a contract address.");
  if (input.metadataBaseURI !== input.expectedMetadataBaseURI) {
    issues.push("The manifest metadata base URI must match the final site origin.");
  }

  const x402Enabled = input.x402RegistrationEnabled?.trim();
  validateQuoteTtl(issues, input.x402QuoteTtlSeconds);
  if (x402Enabled && x402Enabled !== "true" && x402Enabled !== "false") {
    issues.push("X402_REGISTRATION_ENABLED must be exactly true or false.");
  }
  if (x402Enabled === "true") {
    if (!input.x402PaidExecutionImplemented) {
      issues.push("This build does not contain the reviewed paid x402 runtime; environment configuration cannot compensate for a missing implementation.");
    }
    for (const blocker of input.x402ReadinessBlockers ?? []) {
      issues.push(`Paid x402 readiness blocker: ${blocker}.`);
    }
    requireHostedUrl(issues, "X402_FACILITATOR_URL", input.x402FacilitatorUrl);
    requireDurableStoreUrl(issues, input.x402IdempotencyStoreUrl);
    requireAddress(issues, "X402_PAY_TO_ADDRESS", input.x402PayToAddress);
    requireAddress(issues, "X402_PAYMENT_ASSET_ADDRESS", input.x402PaymentAssetAddress);
    requireAddress(issues, "X402_KEEPER_ADDRESS", input.x402KeeperAddress);
    if (input.settlementKind !== "erc20" || !input.settlementTokenAddress) {
      issues.push("x402 registration requires an ERC-20 protocol settlement deployment; native conversion is not inferred.");
    } else if (
      input.x402PaymentAssetAddress?.trim().toLowerCase()
      !== input.settlementTokenAddress.toLowerCase()
    ) {
      issues.push("X402_PAYMENT_ASSET_ADDRESS must exactly match the protocol settlement token.");
    }
    if (
      input.x402PayToAddress?.trim().toLowerCase()
      !== input.x402KeeperAddress?.trim().toLowerCase()
    ) {
      issues.push("X402_PAY_TO_ADDRESS must match the limited keeper address.");
    }
    const signerProvider = input.x402KeeperSignerProvider?.trim();
    if (!signerProvider) {
      issues.push("X402_KEEPER_SIGNER_PROVIDER is required when x402 registration is enabled.");
    } else if (!new Set(["aws-kms", "gcp-kms", "azure-key-vault", "turnkey", "external"]).has(signerProvider.toLowerCase())) {
      issues.push("X402_KEEPER_SIGNER_PROVIDER must name an approved managed or external signer provider.");
    }
    if (input.x402KeeperPrivateKey?.trim()) {
      issues.push("X402_KEEPER_PRIVATE_KEY is forbidden; use managed or external signing.");
    }
  }
  return issues;
}

export async function checkRelease() {
  const manifestPath = resolve(process.cwd(), "apps/web/public/deployment-manifest.json");
  const manifest = deploymentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const v3Manifest = parseV3SuiteManifest(JSON.parse(await readFile(
    resolve(process.cwd(), "apps/web/public/deployment-manifest.v3.json"),
    "utf8",
  )));
  const x402Readiness = x402RegistrationReadiness(
    v3X402DeploymentProfile(v3Manifest),
    process.env,
    COMPILED_X402_RUNTIME_CAPABILITIES,
  );
  const expectedMetadataBaseURI = new URL(
    projectConfig.integration.metadataPath,
    projectConfig.siteUrl,
  ).href;
  const issues = collectReleaseGateIssues({
    explicitSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    publicRpcUrl: projectConfig.chain.rpcUrl,
    serverRpcUrl: process.env.RPC_URL,
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    metadataBaseURI: manifest.metadataBaseURI,
    expectedMetadataBaseURI,
    contract: manifest.contract,
    settlementKind: v3Manifest.settlement.kind,
    settlementTokenAddress: v3Manifest.settlement.tokenAddress,
    x402RegistrationEnabled: process.env.X402_REGISTRATION_ENABLED,
    x402FacilitatorUrl: process.env.X402_FACILITATOR_URL,
    x402PayToAddress: process.env.X402_PAY_TO_ADDRESS,
    x402PaymentAssetAddress: process.env.X402_PAYMENT_ASSET_ADDRESS,
    x402KeeperAddress: process.env.X402_KEEPER_ADDRESS,
    x402KeeperSignerProvider: process.env.X402_KEEPER_SIGNER_PROVIDER,
    x402IdempotencyStoreUrl: process.env.X402_IDEMPOTENCY_STORE_URL,
    x402KeeperPrivateKey: process.env.X402_KEEPER_PRIVATE_KEY,
    x402QuoteTtlSeconds: process.env.X402_QUOTE_TTL_SECONDS,
    x402PaidExecutionImplemented: X402_PAID_EXECUTION_IMPLEMENTED,
    x402ReadinessBlockers: x402Readiness.blockers.map((blocker) => blocker.code),
  });
  if (issues.length > 0) {
    throw new Error(`Release gates failed:\n- ${issues.join("\n- ")}`);
  }
  console.log(`Release environment OK: ${projectConfig.siteUrl}`);
}

if (isMainModule(import.meta.url)) await checkRelease();
