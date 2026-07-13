import { createSepbaseV3McpServer } from "@sepbase/mcp";

export function createReadAndPlanServer(manifestUrl: string, rpcUrl?: string) {
  const manifestOrigin = new URL(manifestUrl).origin;
  return createSepbaseV3McpServer({
    manifestUrl,
    allowedManifestOrigins: [manifestOrigin],
    ...(rpcUrl
      ? { rpcUrl, allowedRpcOrigins: [new URL(rpcUrl).origin] }
      : {}),
  });
}
