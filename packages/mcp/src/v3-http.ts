import { handleMcpPost } from "./http-shared.js";
import {
  createSepbaseV3McpServer,
  type CreateSepbaseV3McpServerOptions,
} from "./v3-server.js";

export {
  mcpHttpMethodNotAllowed,
  mcpHttpOptions,
} from "./http-shared.js";

/**
 * Opt-in stateless V3 HTTP handler. Applications must wire this export to an
 * explicit route; the existing hosted legacy handler is unchanged.
 */
export async function handleSepbaseV3McpPost(
  request: Request,
  options: CreateSepbaseV3McpServerOptions,
) {
  return handleMcpPost(
    request,
    options.allowedRequestOrigins,
    () => createSepbaseV3McpServer(options),
  );
}
