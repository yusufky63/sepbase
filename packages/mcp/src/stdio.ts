#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSepbaseMcpServer } from "./server.js";
import { createSepbaseV3McpServer } from "./v3-server.js";

function configuredUrl(name: "SEPBASE_MANIFEST_URL" | "SEPBASE_RPC_URL", required: boolean) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) throw new Error(`${name} is required.`);
    return undefined;
  }
  const url = new URL(value);
  const loopback = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(`${name} must use HTTPS outside loopback development.`);
  }
  return url;
}

async function main() {
  const suite = process.env.SEPBASE_MCP_SUITE?.trim().toLowerCase() || "legacy";
  if (suite !== "legacy" && suite !== "v3") {
    throw new Error("SEPBASE_MCP_SUITE must be legacy or v3.");
  }
  const manifestUrl = configuredUrl("SEPBASE_MANIFEST_URL", true)!;
  const rpcUrl = configuredUrl("SEPBASE_RPC_URL", false);
  const options = {
    manifestUrl,
    allowedManifestOrigins: [manifestUrl.origin],
    ...(rpcUrl
      ? {
          rpcUrl: rpcUrl.href,
          allowedRpcOrigins: [rpcUrl.origin],
        }
      : {}),
  };
  const server = suite === "v3"
    ? createSepbaseV3McpServer(options)
    : createSepbaseMcpServer(options);
  const transport = new StdioServerTransport();
  process.once("SIGINT", () => {
    void server.close().finally(() => {
      process.exitCode = 130;
    });
  });
  await server.connect(transport);
}

main().catch(() => {
  // stdout belongs exclusively to MCP framing; startup diagnostics stay generic on stderr.
  process.stderr.write("SEPBASE MCP server could not start. Check the configured public endpoints.\n");
  process.exitCode = 1;
});
