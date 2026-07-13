import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Headers": [
    "Accept",
    "Content-Type",
    "Last-Event-ID",
    "Mcp-Protocol-Version",
    "Mcp-Session-Id",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

function withHttpHeaders(response: Response, request?: Request) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  const origin = request?.headers.get("origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  allow?: string,
  request?: Request,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (allow) headers.set("Allow", allow);
  return withHttpHeaders(new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  }), { status, headers }), request);
}

function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function originAllowed(request: Request, allowedOrigins: readonly string[] | undefined) {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return true;
  const normalizedRequestOrigin = normalizedOrigin(requestOrigin);
  if (!normalizedRequestOrigin || normalizedRequestOrigin !== requestOrigin) return false;
  return allowedOrigins?.some((allowed) => normalizedOrigin(allowed) === normalizedRequestOrigin) === true;
}

function rejectForbiddenOrigin() {
  return jsonRpcError(403, -32000, "Forbidden origin.");
}

async function boundedRequest(request: Request): Promise<Request | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) return null;
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  });
}

async function containsSingleJsonRpcMessage(request: Request) {
  try {
    const value: unknown = JSON.parse(await request.clone().text());
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

export function mcpHttpOptions(request?: Request, allowedOrigins?: readonly string[]) {
  if (request && !originAllowed(request, allowedOrigins)) return rejectForbiddenOrigin();
  return withHttpHeaders(new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400",
    },
  }), request);
}

export function mcpHttpMethodNotAllowed(request?: Request, allowedOrigins?: readonly string[]) {
  if (request && !originAllowed(request, allowedOrigins)) return rejectForbiddenOrigin();
  return jsonRpcError(405, -32000, "Method not allowed.", "POST, OPTIONS", request);
}

export async function handleMcpPost(
  request: Request,
  allowedRequestOrigins: readonly string[] | undefined,
  createServer: () => McpServer,
) {
  if (request.method !== "POST") {
    return mcpHttpMethodNotAllowed(request, allowedRequestOrigins);
  }
  if (!originAllowed(request, allowedRequestOrigins)) return rejectForbiddenOrigin();
  const safeRequest = await boundedRequest(request);
  if (!safeRequest) {
    return jsonRpcError(
      413,
      -32000,
      `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`,
      undefined,
      request,
    );
  }
  if (!await containsSingleJsonRpcMessage(safeRequest)) {
    return jsonRpcError(
      400,
      -32600,
      "MCP Streamable HTTP accepts exactly one JSON-RPC message per POST.",
      undefined,
      request,
    );
  }
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(safeRequest);
    return withHttpHeaders(response, request);
  } catch {
    return jsonRpcError(500, -32603, "Internal MCP server error.", undefined, request);
  } finally {
    await server.close().catch(() => undefined);
  }
}
