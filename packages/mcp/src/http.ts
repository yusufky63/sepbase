import { createSepbaseMcpServer, type CreateSepbaseMcpServerOptions } from "./server.js";
import { handleMcpPost } from "./http-shared.js";

export {
  mcpHttpMethodNotAllowed,
  mcpHttpOptions,
} from "./http-shared.js";

/** Compatible hosted legacy MCP handler. */
export async function handleSepbaseMcpPost(
  request: Request,
  options: CreateSepbaseMcpServerOptions,
) {
  return handleMcpPost(
    request,
    options.allowedRequestOrigins,
    () => createSepbaseMcpServer(options),
  );
}
