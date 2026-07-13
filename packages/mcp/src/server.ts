import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createSepbaseClient,
  type CreateSepbaseClientOptions,
  type SepbaseClient,
} from "@sepbase/sdk";
import { z } from "zod/v4";
import { createSepbaseToolHandlers, type ToolOutcome } from "./tools.js";

export type SepbaseClientFactory = (
  options: CreateSepbaseClientOptions,
) => Promise<SepbaseClient>;

export type CreateSepbaseMcpServerOptions = {
  manifestUrl: string | URL;
  rpcUrl?: string;
  fetcher?: typeof fetch;
  allowedManifestOrigins?: readonly string[];
  allowedRpcOrigins?: readonly string[];
  allowedRequestOrigins?: readonly string[];
  clientFactory?: SepbaseClientFactory;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function asMcpResult(outcome: ToolOutcome) {
  const payload = outcome.ok
    ? { ok: true, data: outcome.data }
    : { ok: false, error: outcome.error };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(!outcome.ok ? { isError: true } : {}),
  };
}

function clientOptions(options: CreateSepbaseMcpServerOptions): CreateSepbaseClientOptions {
  const result: CreateSepbaseClientOptions = { manifestUrl: options.manifestUrl };
  if (options.rpcUrl) result.rpcUrl = options.rpcUrl;
  if (options.fetcher) result.fetcher = options.fetcher;
  if (options.allowedManifestOrigins) result.allowedManifestOrigins = options.allowedManifestOrigins;
  if (options.allowedRpcOrigins) result.allowedRpcOrigins = options.allowedRpcOrigins;
  return result;
}

export function createSepbaseMcpServer(options: CreateSepbaseMcpServerOptions) {
  const server = new McpServer({
    name: "sepbase-name-service",
    version: "0.1.0",
  });
  const factory = options.clientFactory ?? createSepbaseClient;
  let pendingClient: Promise<SepbaseClient> | undefined;
  const getClient = () => {
    if (!pendingClient) {
      pendingClient = factory(clientOptions(options)).catch((error: unknown) => {
        pendingClient = undefined;
        throw error;
      });
    }
    return pendingClient;
  };
  const tools = createSepbaseToolHandlers(getClient);

  server.registerTool(
    "resolve_name",
    {
      title: "Resolve a SEPBASE name",
      description:
        "Resolve a label on the configured deployment and report lifecycle plus forward/reverse identity verification. No other name service is queried.",
      inputSchema: {
        label: z.string().min(1).max(64).describe("Label or full configured SEPBASE name."),
        expectedAddress: z.string().optional().describe("Optional EVM address to verify against the result."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.resolveName(input)),
  );

  server.registerTool(
    "reverse_resolve",
    {
      title: "Reverse-resolve an address",
      description:
        "Read the configured deployment's primary name and fail closed unless ownership and forward resolution confirm the address.",
      inputSchema: {
        address: z.string().min(42).max(42).describe("EVM address."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.reverseResolve(input)),
  );

  server.registerTool(
    "check_availability",
    {
      title: "Check name availability",
      description:
        "Return lifecycle, reservation, pause, solvency, and derived registration readiness for a label.",
      inputSchema: {
        label: z.string().min(1).max(64).describe("Label or full configured SEPBASE name."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.checkAvailability(input)),
  );

  server.registerTool(
    "name_info",
    {
      title: "Read name information",
      description:
        "Read effective lifecycle, owner, resolution, public profile, and active fixed-price listing information.",
      inputSchema: {
        label: z.string().min(1).max(64).describe("Label or full configured SEPBASE name."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.nameInfo(input)),
  );

  server.registerTool(
    "quote_registration",
    {
      title: "Quote a registration",
      description:
        "Read a guarded on-chain registration quote in configured settlement base units. This does not reserve the name.",
      inputSchema: {
        label: z.string().min(1).max(64).describe("Label or full configured SEPBASE name."),
        durationYears: z.number().int().min(1).max(5).describe("Registration duration in protocol years."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.quoteRegistration(input)),
  );

  server.registerTool(
    "market_listings",
    {
      title: "List active marketplace names",
      description:
        "Read a bounded page of revalidated active fixed-price listings. Pagination is not a historical snapshot.",
      inputSchema: {
        cursor: z.string().regex(/^\d{1,78}$/).optional().describe("Opaque decimal cursor from a prior result."),
        limit: z.number().int().min(1).max(50).optional().describe("Maximum active listings to return."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.marketListings(input)),
  );

  server.registerTool(
    "protocol_health",
    {
      title: "Read protocol solvency",
      description:
        "Read settlement balance, protected referral and seller liabilities, and current solvency for the configured deployment.",
      annotations: readOnlyAnnotations,
    },
    async () => asMcpResult(await tools.protocolHealth()),
  );

  server.registerTool(
    "prepare_registration",
    {
      title: "Prepare registration calldata",
      description:
        "Return only a current guarded register call plan: ordered arguments, calldata, destination, and native value. It never signs, simulates, sends, broadcasts, approves tokens, or pays.",
      inputSchema: {
        label: z.string().min(1).max(64).describe("Label or full configured SEPBASE name."),
        durationYears: z.number().int().min(1).max(5).describe("Registration duration in protocol years."),
        recipient: z.string().min(42).max(42).describe("EVM address that will own and initially resolve the name."),
        referrer: z.string().min(42).max(42).optional().describe("Optional non-recipient referral address."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareRegistration(input)),
  );

  return server;
}
