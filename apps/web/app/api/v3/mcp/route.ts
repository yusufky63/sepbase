import {
  handleSepbaseV3McpPost,
  mcpHttpMethodNotAllowed,
  mcpHttpOptions,
} from "@sepbase/mcp/v3-http";
import type { CreateSepbaseV3McpServerOptions } from "@sepbase/mcp";
import { projectConfig } from "@/config/project.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedRequestOrigins() {
  return [new URL(projectConfig.siteUrl).origin];
}

function serverOptions(): CreateSepbaseV3McpServerOptions {
  const siteOrigin = new URL(projectConfig.siteUrl).origin;
  const options: CreateSepbaseV3McpServerOptions = {
    manifestUrl: new URL("/deployment-manifest.v3.json", siteOrigin),
    allowedManifestOrigins: [siteOrigin],
    allowedRequestOrigins: [siteOrigin],
  };
  const rpcUrl = process.env.RPC_URL?.trim();
  if (rpcUrl) {
    options.rpcUrl = rpcUrl;
    options.allowedRpcOrigins = [new URL(rpcUrl).origin];
  }
  return options;
}

export async function POST(request: Request) {
  return handleSepbaseV3McpPost(request, serverOptions());
}

export function OPTIONS(request: Request) {
  return mcpHttpOptions(request, allowedRequestOrigins());
}

export function GET(request: Request) {
  return mcpHttpMethodNotAllowed(request, allowedRequestOrigins());
}

export function DELETE(request: Request) {
  return mcpHttpMethodNotAllowed(request, allowedRequestOrigins());
}
