import {
  handleSepbaseMcpPost,
  mcpHttpMethodNotAllowed,
  mcpHttpOptions,
} from "@sepbase/mcp/http";
import type { CreateSepbaseMcpServerOptions } from "@sepbase/mcp";
import { projectConfig } from "@/config/project.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serverOptions(): CreateSepbaseMcpServerOptions {
  const siteOrigin = new URL(projectConfig.siteUrl).origin;
  const manifestUrl = new URL(projectConfig.integration.wellKnownPath, siteOrigin);
  const options: CreateSepbaseMcpServerOptions = {
    manifestUrl,
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
  return handleSepbaseMcpPost(request, serverOptions());
}

function allowedRequestOrigins() {
  return [new URL(projectConfig.siteUrl).origin];
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
