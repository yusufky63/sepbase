import "./lib/load-env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectConfig } from "../apps/web/config/project.config";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import { isMainModule } from "./lib/is-main";

export type ReleaseGateInput = {
  explicitSiteUrl: string | undefined;
  publicRpcUrl: string;
  serverRpcUrl: string | undefined;
  walletConnectProjectId: string | undefined;
  metadataBaseURI: string;
  expectedMetadataBaseURI: string;
  contract: string | null;
};

export function collectReleaseGateIssues(input: ReleaseGateInput) {
  const issues: string[] = [];
  const siteUrl = input.explicitSiteUrl?.trim();
  if (!siteUrl) {
    issues.push("NEXT_PUBLIC_SITE_URL must be set explicitly.");
  } else {
    const site = new URL(siteUrl);
    if (site.protocol !== "https:") issues.push("NEXT_PUBLIC_SITE_URL must use HTTPS.");
    if (site.hostname === "localhost" || site.hostname === "127.0.0.1" || site.hostname === "::1") {
      issues.push("NEXT_PUBLIC_SITE_URL must use the final public hostname.");
    }
  }

  const serverRpcUrl = input.serverRpcUrl?.trim();
  if (!serverRpcUrl) {
    issues.push("RPC_URL must provide a server-only production RPC endpoint.");
  } else {
    try {
      const rpc = new URL(serverRpcUrl);
      if (rpc.protocol !== "https:") issues.push("RPC_URL must use HTTPS for a hosted release.");
      if (serverRpcUrl === input.publicRpcUrl) {
        issues.push("RPC_URL must be separate from the browser-visible public RPC URL.");
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
  return issues;
}

export async function checkRelease() {
  const manifestPath = resolve(process.cwd(), "apps/web/public/deployment-manifest.json");
  const manifest = deploymentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
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
  });
  if (issues.length > 0) {
    throw new Error(`Release gates failed:\n- ${issues.join("\n- ")}`);
  }
  console.log(`Release environment OK: ${projectConfig.siteUrl}`);
}

if (isMainModule(import.meta.url)) await checkRelease();
