import { projectConfig } from "@/config/project.config";
import { apiJson, OPTIONS } from "@/lib/api-response";
import { deploymentManifest } from "@/lib/deployment-manifest";
import { v3Manifest } from "@/lib/v3-api";

export { OPTIONS };

const integrationApiVersion = "1.7.0";

const jsonResponse = (description: string, schema: object) => ({
  description,
  content: { "application/json": { schema } },
});

const errorResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "503": { $ref: "#/components/responses/DeploymentOrRpcUnavailable" },
};

export function GET() {
  const document = {
    openapi: "3.1.0",
    info: {
      title: `${projectConfig.brand.name} integration API`,
      version: integrationApiVersion,
      description: `RPC-backed reads for .${projectConfig.brand.suffix} names plus agent discovery, MCP transport, and a default-disabled x402 registration boundary. Integer asset amounts are decimal base-unit strings.`,
    },
    servers: [{ url: projectConfig.siteUrl }],
    tags: [
      { name: "Names", description: "Registry records and resolution." },
      { name: "Market", description: "Validated fixed-price listings." },
      { name: "NFT", description: "ERC-721 metadata and deterministic images." },
      { name: "Agents", description: "Machine clients and MCP transport. MCP has no signing or broadcast authority." },
      { name: "x402", description: "Free registration quotes plus an activation-gated paid V3 commit/reveal route with official x402 V2 negotiation, durable idempotency, managed signing, and Workflow DevKit continuation." },
      { name: "V3", description: "Draft-aware seven-module V3 discovery and block-pinned read APIs. Chain reads return V3_NOT_DEPLOYED until the candidate/live manifest is evidenced." },
    ],
    paths: {
      "/api/v3/normalization-attestation": {
        post: {
          operationId: "requestV3NormalizationAttestation",
          tags: ["V3"],
          summary: "Request a release-scoped normalization attestation",
          description: "Same-origin browser proxy for candidate/live V3 releases. It normalizes with the exact pinned ENSIP-15 profile, requires explicit confirmation when canonical output changes, forwards only to a server-configured authenticated external issuer, and locally verifies the returned scope, validity, canonical ECDSA signature, immutable attestor recovery, and controller attestation hash. Draft releases return 503 before issuer configuration or network I/O. The route has no private-key or signing implementation.",
          parameters: [{ $ref: "#/components/parameters/RequestOrigin" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/V3NormalizationAttestationRequest" },
              },
            },
          },
          responses: {
            "200": jsonResponse("Locally verified external normalization attestation.", { $ref: "#/components/schemas/V3NormalizationAttestationEnvelope" }),
            "400": jsonResponse("Malformed UTF-8 JSON or strict request-schema mismatch.", { type: "object" }),
            "403": jsonResponse("Origin does not exactly match the configured site origin.", { type: "object" }),
            "409": jsonResponse("Release scope mismatch or canonical output requires explicit confirmation.", { type: "object" }),
            "413": jsonResponse("Request body exceeds 8 KiB.", { type: "object" }),
            "415": jsonResponse("Content-Type must be application/json.", { type: "object" }),
            "422": jsonResponse("Input is invalid under the pinned ENSIP-15 profile.", { type: "object" }),
            "502": jsonResponse("Issuer response failed local scope or signature verification.", { type: "object" }),
            "503": jsonResponse("V3 is draft, release bindings are incomplete, or the external issuer is unavailable.", { type: "object" }),
          },
        },
      },
      "/api/v3/status": {
        get: {
          operationId: "getV3Status",
          tags: ["V3"],
          summary: "Inspect the V3 release manifest and capability state",
          responses: {
            "200": jsonResponse("V3 draft/candidate/live discovery.", { $ref: "#/components/schemas/V3Envelope" }),
          },
        },
      },
      "/api/v3/account/{address}": {
        get: {
          operationId: "getV3Account",
          tags: ["V3"],
          summary: "Read one block-pinned V3 account workspace",
          description: "Returns bounded ERC-721 owner enumeration, referral rewards, marketplace proceeds/refunds, forward-confirmed primary identity, and buyer/owner offer pages. Loading failures remain errors and are never represented as zero balances.",
          parameters: [
            { $ref: "#/components/parameters/V3Address" },
            { name: "nameCursor", in: "query", required: false, schema: { type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 78 } },
            { name: "offerCursor", in: "query", required: false, schema: { type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 78 } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 24 } },
            { name: "includeTerminal", in: "query", required: false, schema: { type: "boolean", default: false } },
            { name: "blockNumber", in: "query", required: false, schema: { type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 78 } },
          ],
          responses: {
            "200": jsonResponse("Pinned V3 account snapshot.", { $ref: "#/components/schemas/V3AccountEnvelope" }),
            "400": { $ref: "#/components/responses/V3BadRequest" },
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      "/api/v3/name/{label}": {
        get: {
          operationId: "getV3Name",
          tags: ["V3"],
          summary: "Read a normalized V3 name record at one block",
          parameters: [{ $ref: "#/components/parameters/V3Label" }],
          responses: {
            "200": jsonResponse("V3 name record.", { $ref: "#/components/schemas/V3Envelope" }),
            "400": { $ref: "#/components/responses/V3BadRequest" },
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      "/api/v3/resolve/{label}": {
        get: {
          operationId: "resolveV3Name",
          tags: ["V3"],
          summary: "Resolve a V3 address and optional text record",
          parameters: [
            { $ref: "#/components/parameters/V3Label" },
            { name: "textKey", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          ],
          responses: {
            "200": jsonResponse("V3 resolution record.", { $ref: "#/components/schemas/V3Envelope" }),
            "400": { $ref: "#/components/responses/V3BadRequest" },
            "404": { $ref: "#/components/responses/V3NotFound" },
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      "/api/v3/reverse/{address}": {
        get: {
          operationId: "reverseResolveV3",
          tags: ["V3"],
          summary: "Read a forward-confirmed V3 primary name",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } }],
          responses: {
            "200": jsonResponse("V3 reverse-resolution result.", { $ref: "#/components/schemas/V3Envelope" }),
            "400": { $ref: "#/components/responses/V3BadRequest" },
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      "/api/v3/market": {
        get: {
          operationId: "getV3Market",
          tags: ["V3", "Market"],
          summary: "Read block-pinned V3 listings, offers, or auctions through MarketLens",
          description: "Pages return at most 50 items and scan at most 100 raw entries. Preserve blockNumber, follow the raw nextCursor, deduplicate IDs, and revalidate before any write.",
          parameters: [
            { name: "view", in: "query", schema: { type: "string", enum: ["listings", "offers", "auctions"], default: "listings" } },
            { name: "scope", in: "query", schema: { type: "string", enum: ["global", "buyer", "owner"], default: "global" } },
            { name: "account", in: "query", schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
            { name: "includeTerminal", in: "query", schema: { type: "boolean", default: false } },
            { name: "cursor", in: "query", schema: { type: "string", pattern: "^\\d+$", default: "0" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 24 } },
            { name: "blockNumber", in: "query", schema: { type: "string", pattern: "^\\d+$" } },
          ],
          responses: {
            "200": jsonResponse("V3 MarketLens page.", { $ref: "#/components/schemas/V3Envelope" }),
            "400": { $ref: "#/components/responses/V3BadRequest" },
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      "/api/v3/health": {
        get: {
          operationId: "getV3Health",
          tags: ["V3"],
          summary: "Read controller, marketplace, and suite liability solvency",
          responses: {
            "200": jsonResponse("V3 liability and solvency snapshot.", { $ref: "#/components/schemas/V3Envelope" }),
            "503": { $ref: "#/components/responses/V3Unavailable" },
          },
        },
      },
      [projectConfig.integration.nameApiPath]: {
        get: {
          operationId: "getName",
          tags: ["Names"],
          summary: "Read a complete name record",
          parameters: [
            { $ref: "#/components/parameters/Label" },
            { $ref: "#/components/parameters/DurationYears" },
          ],
          responses: {
            "200": jsonResponse("Registry record.", { $ref: "#/components/schemas/NameEnvelope" }),
            ...errorResponses,
          },
        },
      },
      [projectConfig.integration.resolveApiPath]: {
        get: {
          operationId: "resolveName",
          tags: ["Names"],
          summary: "Resolve a label to its effective address",
          parameters: [{ $ref: "#/components/parameters/Label" }],
          responses: {
            "200": jsonResponse("Forward-resolution result.", { $ref: "#/components/schemas/ResolveEnvelope" }),
            "404": { $ref: "#/components/responses/NotFound" },
            ...errorResponses,
          },
        },
      },
      [projectConfig.integration.reverseApiPath]: {
        get: {
          operationId: "reverseResolve",
          tags: ["Names"],
          summary: "Read a forward-confirmed primary name",
          parameters: [{
            name: "address",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          }],
          responses: {
            "200": jsonResponse("Reverse-resolution result.", { $ref: "#/components/schemas/ReverseEnvelope" }),
            ...errorResponses,
          },
        },
      },
      [projectConfig.integration.marketApiPath]: {
        get: {
          operationId: "getMarket",
          tags: ["Market"],
          summary: "Read validated active listings",
          parameters: [
            { name: "cursor", in: "query", schema: { type: "string", pattern: "^\\d+$", default: "0" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: projectConfig.marketplace.listingsPerPage } },
          ],
          responses: {
            "200": jsonResponse("Marketplace page.", { $ref: "#/components/schemas/MarketResponse" }),
            ...errorResponses,
          },
        },
      },
      [projectConfig.integration.mcpPath]: {
        post: {
          operationId: "mcpStreamableHttp",
          tags: ["Agents"],
          summary: "Send a stateless MCP Streamable HTTP request",
          description: "MCP 2025-11-25 Streamable HTTP. Public read tools and unsigned guarded transaction preparation only; this endpoint never signs or broadcasts. Browser requests with an Origin header are accepted only from the configured canonical site origin, while non-browser clients may omit Origin.",
          parameters: [
            { $ref: "#/components/parameters/McpAccept" },
            { $ref: "#/components/parameters/McpProtocolVersion" },
            { $ref: "#/components/parameters/RequestOrigin" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JsonRpcRequest" } },
            },
          },
          responses: {
            "200": {
              description: "MCP JSON-RPC response or Streamable HTTP event stream.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/JsonRpcResponse" } },
                "text/event-stream": { schema: { type: "string" } },
              },
            },
            "202": { description: "Accepted notification or response with no response body." },
            "400": { description: "Malformed or invalid MCP request." },
            "403": { description: "The supplied Origin is not the configured canonical origin." },
            "406": { description: "Accept must permit both application/json and text/event-stream." },
            "413": { description: "Request body exceeds the 64 KiB transport limit." },
            "415": { description: "Content-Type must be application/json." },
            "500": { description: "MCP transport or server failure with a sanitized JSON-RPC error." },
          },
        },
      },
      "/api/v3/mcp": {
        post: {
          operationId: "mcpV3StreamableHttp",
          tags: ["Agents", "V3"],
          summary: "Send a stateless V3 MCP Streamable HTTP request",
          description: "Opt-in V3 MCP 2025-11-25 surface with ENSIP-15 reads and block-pinned unsigned market, resolver, claim, transfer, renewal, and migration plans. Registration is requirements-only: this endpoint accepts no commitment secret, attestor signature, private key, wallet session, x402 authorization, or payment payload and never signs or broadcasts. Tool calls fail closed while the V3 manifest remains a draft.",
          parameters: [
            { $ref: "#/components/parameters/McpAccept" },
            { $ref: "#/components/parameters/McpProtocolVersion" },
            { $ref: "#/components/parameters/RequestOrigin" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JsonRpcRequest" } },
            },
          },
          responses: {
            "200": {
              description: "V3 MCP JSON-RPC response or Streamable HTTP event stream.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/JsonRpcResponse" } },
                "text/event-stream": { schema: { type: "string" } },
              },
            },
            "202": { description: "Accepted notification or response with no response body." },
            "400": { description: "Malformed or invalid MCP request." },
            "403": { description: "The supplied Origin is not the configured canonical origin." },
            "406": { description: "Accept must permit both application/json and text/event-stream." },
            "413": { description: "Request body exceeds the 64 KiB transport limit." },
            "415": { description: "Content-Type must be application/json." },
            "500": { description: "MCP transport or server failure with a sanitized JSON-RPC error." },
          },
        },
      },
      [projectConfig.integration.x402QuotePath]: {
        get: {
          operationId: "quoteX402Registration",
          tags: ["x402"],
          summary: "Read a free, short-lived agent registration quote",
          description: "The quote is scoped to this deployment and reflects current on-chain availability, price, referral rate, pause state, and solvency.",
          parameters: [
            { $ref: "#/components/parameters/QuoteLabel" },
            { $ref: "#/components/parameters/RequiredDurationYears" },
            { $ref: "#/components/parameters/Recipient" },
            { $ref: "#/components/parameters/Referrer" },
          ],
          responses: {
            "200": jsonResponse("Canonical registration quote and paid-service readiness.", { $ref: "#/components/schemas/X402QuoteEnvelope" }),
            "400": { $ref: "#/components/responses/X402Failure" },
            "409": { $ref: "#/components/responses/X402Failure" },
            "503": { $ref: "#/components/responses/X402Failure" },
          },
        },
        post: {
          operationId: "preparePaidV3RegistrationQuote",
          tags: ["x402"],
          summary: "Prepare an encrypted paid V3 registration plan",
          description: "Available only after all live/runtime gates pass. Normalizes with ENSIP-15, obtains an external immutable-attestor signature, prepares exact commit/register calldata, validates price/referral/keeper funding at one block, stores the secret-bearing plan in the encrypted CAS, and returns only the HMAC-authenticated quote plus quoteId/planId.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "recipient", "durationYears", "initialization"],
                  properties: {
                    label: { type: "string", minLength: 1, maxLength: 256 },
                    recipient: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                    durationYears: { type: "integer", enum: [1, 2, 3, 4, 5] },
                    referrer: { type: ["string", "null"], pattern: "^0x[0-9a-fA-F]{40}$" },
                    initialization: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("Signed V3 quote identifiers; the secret-bearing plan remains encrypted server-side.", { type: "object" }),
            "400": { $ref: "#/components/responses/X402Failure" },
            "409": { $ref: "#/components/responses/X402Failure" },
            "413": { $ref: "#/components/responses/X402Failure" },
            "415": { $ref: "#/components/responses/X402Failure" },
            "503": { $ref: "#/components/responses/X402Failure" },
          },
        },
      },
      [projectConfig.integration.x402RegisterPath]: {
        post: {
          operationId: "registerWithX402",
          tags: ["x402"],
          summary: "Negotiate or enqueue a paid V3 registration",
          description: "Accepts an authenticated V3 quote and exact commit/register plan. Without PAYMENT-SIGNATURE it returns the persisted official x402 V2 challenge (402). After verification it atomically reserves the encrypted order and starts a Workflow DevKit continuation (202); settled idempotent replays return 200 with PAYMENT-RESPONSE. The route returns 503 before parsing payment material unless the live V3 ERC-20 release, facilitator, authenticated RPC, encrypted CAS, managed signer, attestation issuer and workflow gates are all verified.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["signedQuote", "quoteId", "planId"],
                  properties: {
                    signedQuote: { type: "object", description: "Server-authenticated V3 payment quote bound to planId." },
                    quoteId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
                    planId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$", description: "Loads the secret-bearing plan from encrypted CAS; calldata is never supplied by the client." },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("Previously settled idempotent order and PAYMENT-RESPONSE header.", { type: "object" }),
            "202": jsonResponse("Payment verified and durable workflow queued.", { type: "object" }),
            "402": { $ref: "#/components/responses/X402Failure" },
            "400": { $ref: "#/components/responses/X402Failure" },
            "409": { $ref: "#/components/responses/X402Failure" },
            "413": { $ref: "#/components/responses/X402Failure" },
            "415": { $ref: "#/components/responses/X402Failure" },
            "431": { $ref: "#/components/responses/X402Failure" },
            "503": { $ref: "#/components/responses/X402Failure" },
          },
        },
      },
      ["/api/x402/registration/status"]: {
        get: {
          operationId: "getX402RegistrationOrder",
          tags: ["x402"],
          summary: "Reconcile a durable paid registration order",
          description: "After an HTTP timeout, query the non-secret paymentIdentifier + planId pair instead of creating another payment. Returns commit, reveal, settlement and refund-disposition state without exposing payment payload, authorization hashes, quote authentication or the secret-bearing plan.",
          parameters: [
            { name: "paymentIdentifier", in: "query", required: true, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" } },
            { name: "planId", in: "query", required: true, schema: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } },
          ],
          responses: {
            "200": jsonResponse("Durable paid registration order state.", { type: "object" }),
            "400": { $ref: "#/components/responses/X402Failure" },
            "404": { $ref: "#/components/responses/X402Failure" },
            "503": { $ref: "#/components/responses/X402Failure" },
          },
        },
      },
      [`${projectConfig.integration.metadataPath}{tokenId}`]: {
        get: {
          operationId: "getTokenMetadata",
          tags: ["NFT"],
          summary: "Read ERC-721 metadata",
          parameters: [{ $ref: "#/components/parameters/TokenId" }],
          responses: {
            "200": jsonResponse("ERC-721 metadata.", { type: "object" }),
            "404": { $ref: "#/components/responses/NotFound" },
            ...errorResponses,
          },
        },
      },
      [`${projectConfig.integration.imagePath}{tokenId}`]: {
        get: {
          operationId: "getTokenImage",
          tags: ["NFT"],
          summary: "Render the deterministic name image",
          parameters: [{ $ref: "#/components/parameters/TokenId" }],
          responses: {
            "200": { description: "SVG image.", content: { "image/svg+xml": { schema: { type: "string" } } } },
            "404": { $ref: "#/components/responses/NotFound" },
            ...errorResponses,
          },
        },
      },
    },
    components: {
      parameters: {
        V3Label: {
          name: "label",
          in: "path",
          required: true,
          description: "Exact ENSIP-15 canonical UTF-8 label without the configured suffix. Non-canonical input returns a normalized suggestion.",
          schema: { type: "string", minLength: 1, maxLength: 32 },
        },
        Label: {
          name: "label",
          in: "path",
          required: true,
          description: `Canonical lowercase label without the .${projectConfig.brand.suffix} suffix. Non-canonical input returns INVALID_INPUT with a normalized suggestion.`,
          schema: {
            type: "string",
            minLength: deploymentManifest.nameRules.minLength,
            maxLength: deploymentManifest.nameRules.maxLength,
            pattern: "^(?!-)(?!.*--)[a-z0-9-]+(?<!-)$",
          },
        },
        McpAccept: {
          name: "Accept",
          in: "header",
          required: true,
          description: "Must advertise both MCP Streamable HTTP response media types.",
          schema: {
            type: "string",
            example: "application/json, text/event-stream",
          },
        },
        McpProtocolVersion: {
          name: "MCP-Protocol-Version",
          in: "header",
          required: false,
          description: "Required on subsequent requests after initialization.",
          schema: { type: "string", const: "2025-11-25" },
        },
        RequestOrigin: {
          name: "Origin",
          in: "header",
          required: false,
          description: "Browser origin. If present, it must exactly match the configured canonical site origin.",
          schema: { type: "string", format: "uri" },
        },
        TokenId: {
          name: "tokenId",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^\\d+$" },
        },
        DurationYears: {
          name: "durationYears",
          in: "query",
          required: false,
          description: "Registration term used for the returned quote.",
          schema: {
            type: "integer",
            enum: deploymentManifest.nameRules.allowedYears,
            default: deploymentManifest.nameRules.allowedYears[0],
          },
        },
        QuoteLabel: {
          name: "label",
          in: "query",
          required: true,
          description: `Canonical lowercase label without the .${deploymentManifest.suffix} suffix.`,
          schema: {
            type: "string",
            minLength: deploymentManifest.nameRules.minLength,
            maxLength: deploymentManifest.nameRules.maxLength,
            pattern: "^[a-z0-9-]+$",
          },
        },
        RequiredDurationYears: {
          name: "durationYears",
          in: "query",
          required: true,
          schema: { type: "integer", enum: deploymentManifest.nameRules.allowedYears },
        },
        Recipient: {
          name: "recipient",
          in: "query",
          required: true,
          schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        },
        Referrer: {
          name: "referrer",
          in: "query",
          required: false,
          schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        },
      },
      schemas: {
        JsonRpcRequest: {
          type: "object",
          required: ["jsonrpc", "method"],
          properties: {
            jsonrpc: { type: "string", const: "2.0" },
            id: { type: ["string", "number", "null"] },
            method: { type: "string" },
            params: { type: ["object", "array", "null"] },
          },
          additionalProperties: true,
        },
        JsonRpcResponse: {
          type: "object",
          required: ["jsonrpc"],
          properties: {
            jsonrpc: { type: "string", const: "2.0" },
            id: { type: ["string", "number", "null"] },
            result: {},
            error: { type: "object" },
          },
          additionalProperties: true,
        },
        X402RegistrationQuote: {
          type: "object",
          required: ["schema", "quoteId", "authentication", "scope", "request", "terms", "state", "issuedAt", "expiresAt"],
          properties: {
            schema: { type: "string", const: "sepbase.x402.registration-quote.v1" },
            quoteId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            authentication: {
              type: "object",
              required: ["algorithm", "keyId", "signature"],
              properties: {
                algorithm: { type: "string", const: "hmac-sha256" },
                keyId: { type: "string", pattern: "^[A-Za-z0-9._-]{1,64}$" },
                signature: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
              },
              additionalProperties: false,
            },
            scope: {
              type: "object",
              required: ["chainId", "network", "contract", "contractVersion", "suffix", "resource"],
              properties: {
                chainId: { type: "integer", const: deploymentManifest.chainId },
                network: { type: "string", const: `eip155:${deploymentManifest.chainId}` },
                contract: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                contractVersion: { type: "string", const: deploymentManifest.contractVersion },
                suffix: { type: "string", const: deploymentManifest.suffix },
                resource: { type: "string", const: projectConfig.integration.x402RegisterPath },
              },
            },
            request: {
              type: "object",
              required: ["label", "fullName", "durationYears", "recipient", "referrer"],
              properties: {
                label: { type: "string" },
                fullName: { type: "string" },
                durationYears: { type: "integer", enum: deploymentManifest.nameRules.allowedYears },
                recipient: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                referrer: { type: ["string", "null"], pattern: "^0x[0-9a-fA-F]{40}$" },
              },
            },
            terms: {
              type: "object",
              required: ["expectedAmountBaseUnits", "expectedReferralRewardBps", "settlement"],
              properties: {
                expectedAmountBaseUnits: { type: "string", pattern: "^[1-9][0-9]*$" },
                expectedReferralRewardBps: { type: "integer", minimum: 0, maximum: 2000 },
                settlement: { $ref: "#/components/schemas/X402Settlement" },
              },
            },
            state: {
              type: "object",
              required: ["tokenId", "blockNumber", "available", "reserved", "registrationsPaused", "solvent"],
              properties: {
                tokenId: { type: "string", pattern: "^[0-9]+$" },
                blockNumber: { type: "string", pattern: "^[0-9]+$" },
                available: { type: "boolean", const: true },
                reserved: { type: "boolean", const: false },
                registrationsPaused: { type: "boolean", const: false },
                solvent: { type: "boolean", const: true },
              },
            },
            issuedAt: { type: "string", pattern: "^[0-9]+$", description: "Unix timestamp in seconds." },
            expiresAt: { type: "string", pattern: "^[0-9]+$", description: "Unix timestamp in seconds." },
          },
        },
        X402Readiness: {
          type: "object",
          additionalProperties: false,
          required: ["available", "implementationStatus", "paidExecutionImplemented", "protocolVersion", "network"],
          properties: {
            available: { type: "boolean", description: "True only when the live V3 release and every server-only runtime capability are verified." },
            implementationStatus: { type: "string", enum: ["activation-gated", "operational"], description: "Source implementation state, separate from deployment availability." },
            paidExecutionImplemented: { type: "boolean", const: true },
            protocolVersion: { type: "integer", const: 2 },
            network: { type: "string", const: `eip155:${deploymentManifest.chainId}` },
          },
        },
        X402Settlement: {
          type: "object",
          required: ["kind", "asset", "symbol", "decimals"],
          properties: {
            kind: { type: "string", enum: ["native", "erc20"] },
            asset: { type: ["string", "null"], pattern: "^0x[0-9a-fA-F]{40}$" },
            symbol: { type: "string" },
            decimals: { type: "integer", minimum: 0, maximum: 36 },
          },
        },
        X402QuoteEnvelope: {
          type: "object",
          required: ["data", "registrationService"],
          properties: {
            data: { $ref: "#/components/schemas/X402RegistrationQuote" },
            registrationService: { $ref: "#/components/schemas/X402Readiness" },
          },
        },
        ApiContext: {
          type: "object",
          required: ["contractVersion", "chainId", "chainName", "contract", "suffix", "nameRules", "settlement", "pricing"],
          properties: {
            contractVersion: { type: "string", const: deploymentManifest.contractVersion },
            chainId: { type: "integer" },
            chainName: { type: "string" },
            contract: { type: ["string", "null"] },
            suffix: { type: "string" },
            nameRules: {
              type: "object",
              required: ["minLength", "maxLength", "allowedYears"],
              properties: {
                minLength: { type: "integer" },
                maxLength: { type: "integer" },
                allowedYears: { type: "array", items: { type: "integer" } },
              },
            },
            settlement: { $ref: "#/components/schemas/Settlement" },
            pricing: { $ref: "#/components/schemas/Pricing" },
          },
        },
        Settlement: {
          type: "object",
          required: ["kind", "tokenAddress", "name", "symbol", "decimals"],
          properties: {
            kind: { type: "string", enum: ["native", "erc20"] },
            tokenAddress: { type: ["string", "null"] },
            name: { type: "string" },
            symbol: { type: "string" },
            decimals: { type: "integer", minimum: 0 },
          },
        },
        Pricing: {
          type: "object",
          required: ["standardAnnualPriceBaseUnits", "shortNamePriceMultipliers", "referenceFiat"],
          properties: {
            standardAnnualPriceBaseUnits: { type: "string", pattern: "^\\d+$" },
            shortNamePriceMultipliers: {
              type: "array",
              prefixItems: [
                { type: "integer", minimum: 1, maximum: 255 },
                { type: "integer", minimum: 1, maximum: 255 },
                { type: "integer", minimum: 1, maximum: 255 },
              ],
              minItems: 3,
              maxItems: 3,
            },
            referenceFiat: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  required: ["currency", "amount", "asOf", "maxAgeDays"],
                  properties: {
                    currency: { type: "string", pattern: "^[A-Z]{3}$" },
                    amount: { type: "string", pattern: "^\\d+(?:\\.\\d+)?$" },
                    asOf: { type: "string", format: "date" },
                    maxAgeDays: { type: "integer", minimum: 1 },
                  },
                },
              ],
            },
          },
        },
        Profile: {
          type: "object",
          required: ["displayName", "bio", "avatar", "website", "twitter", "github"],
          properties: {
            displayName: { type: "string" },
            bio: { type: "string" },
            avatar: { type: "string" },
            website: { type: "string" },
            twitter: { type: "string" },
            github: { type: "string" },
          },
        },
        NameListing: {
          type: ["object", "null"],
          required: ["tokenId", "seller", "priceBaseUnits", "listedAt", "feeBps"],
          properties: {
            tokenId: { type: "string", pattern: "^\\d+$" },
            seller: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            priceBaseUnits: { type: "string", pattern: "^\\d+$" },
            listedAt: { type: "string", pattern: "^\\d+$" },
            feeBps: { type: "integer" },
          },
        },
        NameEnvelope: {
          type: "object",
          required: ["data", "context"],
          properties: {
            data: {
              type: "object",
              required: ["label", "fullName", "tokenId", "available", "reserved", "status"],
              properties: {
                label: { type: "string" },
                fullName: { type: "string" },
                tokenId: { type: "string", pattern: "^\\d+$" },
                available: { type: "boolean" },
                reserved: { type: "boolean" },
                status: { type: "string", enum: ["UNREGISTERED", "ACTIVE", "GRACE", "RELEASED"] },
                nftOwner: { type: ["string", "null"] },
                effectiveOwner: { type: ["string", "null"] },
                resolvedAddress: { type: ["string", "null"] },
                expiresAt: { type: ["string", "null"] },
                profile: { oneOf: [{ $ref: "#/components/schemas/Profile" }, { type: "null" }] },
                listing: { $ref: "#/components/schemas/NameListing" },
                quote: {
                  type: "object",
                  required: ["years", "amountBaseUnits"],
                  properties: {
                    years: { type: "integer" },
                    amountBaseUnits: { type: "string", pattern: "^\\d+$" },
                  },
                },
              },
            },
            context: { $ref: "#/components/schemas/ApiContext" },
          },
        },
        ResolveEnvelope: {
          type: "object",
          required: ["data", "context"],
          properties: {
            data: {
              type: "object",
              required: ["label", "fullName", "resolvedAddress", "owner", "expiresAt", "status", "profile", "blockNumber"],
              properties: {
                label: { type: "string" },
                fullName: { type: "string" },
                resolvedAddress: { type: ["string", "null"] },
                owner: { type: "string" },
                expiresAt: { type: ["string", "null"] },
                status: { type: "string", enum: ["ACTIVE", "GRACE"] },
                profile: { $ref: "#/components/schemas/Profile" },
                blockNumber: { type: "string", pattern: "^\\d+$" },
              },
            },
            context: { $ref: "#/components/schemas/ApiContext" },
          },
        },
        ReverseEnvelope: {
          type: "object",
          required: ["data", "context"],
          properties: {
            data: {
              type: "object",
              required: [
                "address",
                "primaryName",
                "label",
                "owner",
                "resolvedAddress",
                "expiresAt",
                "status",
                "ownerConfirmed",
                "forwardConfirmed",
                "verified",
                "blockNumber",
              ],
              properties: {
                address: { type: "string" },
                primaryName: { type: ["string", "null"] },
                label: { type: ["string", "null"] },
                owner: { type: ["string", "null"] },
                resolvedAddress: { type: ["string", "null"] },
                expiresAt: { type: ["string", "null"], pattern: "^\\d+$" },
                status: { type: ["string", "null"], enum: ["ACTIVE", "GRACE", null] },
                ownerConfirmed: { type: "boolean" },
                forwardConfirmed: { type: "boolean" },
                verified: { type: "boolean" },
                blockNumber: { type: "string", pattern: "^\\d+$" },
              },
            },
            context: { $ref: "#/components/schemas/ApiContext" },
          },
        },
        MarketResponse: {
          type: "object",
          required: ["items", "marketplacePaused", "solvent", "blockNumber", "nextCursor", "hasMore", "scanned", "context"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/MarketListing" } },
            marketplacePaused: { type: "boolean" },
            solvent: { type: "boolean" },
            blockNumber: { type: "string" },
            nextCursor: { type: ["string", "null"] },
            hasMore: { type: "boolean" },
            scanned: { type: "integer" },
            context: { $ref: "#/components/schemas/ApiContext" },
          },
        },
        MarketListing: {
          type: "object",
          required: ["tokenId", "label", "fullName", "seller", "priceBaseUnits", "feeBps", "listedAt", "expiresAt", "purchasable"],
          properties: {
            tokenId: { type: "string" },
            label: { type: "string" },
            fullName: { type: "string" },
            seller: { type: "string" },
            priceBaseUnits: { type: "string" },
            feeBps: { type: "integer" },
            listedAt: { type: "string" },
            expiresAt: { type: "string" },
            purchasable: { type: "boolean" },
          },
        },
        ErrorEnvelope: {
          type: "object",
          required: ["error", "context"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "string" }, message: { type: "string" } },
            },
            context: { $ref: "#/components/schemas/ApiContext" },
          },
        },
        V3NormalizationAttestationRequest: {
          type: "object",
          required: [
            "schemaVersion",
            "suiteReleaseId",
            "chainId",
            "controller",
            "normalizationProfileId",
            "normalizationProfileHash",
            "attestor",
            "recipient",
            "rawInput",
          ],
          properties: {
            schemaVersion: { type: "integer", const: 1 },
            suiteReleaseId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            chainId: { type: "integer", minimum: 1 },
            controller: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            normalizationProfileId: { type: "string", minLength: 1, maxLength: 200 },
            normalizationProfileHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            attestor: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            recipient: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            rawInput: { type: "string", minLength: 1, description: "Maximum 512 UTF-8 bytes." },
            canonicalLabel: { type: "string", description: "Required when the raw input changes during exact normalization; maximum 96 UTF-8 bytes." },
          },
          additionalProperties: false,
        },
        V3NormalizationAttestationEnvelope: {
          type: "object",
          required: ["data"],
          properties: {
            data: {
              type: "object",
              required: [
                "schemaVersion",
                "suiteReleaseId",
                "chainId",
                "controller",
                "normalizationProfileId",
                "normalizationProfileHash",
                "normalizedLabel",
                "normalizedFullName",
                "labelHash",
                "recipient",
                "attestor",
                "validUntil",
                "signature",
                "typedDataDigest",
                "controllerAttestationHash",
              ],
              properties: {
                schemaVersion: { type: "integer", const: 1 },
                suiteReleaseId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
                chainId: { type: "integer", minimum: 1 },
                controller: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                normalizationProfileId: { type: "string" },
                normalizationProfileHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                normalizedLabel: { type: "string" },
                normalizedFullName: { type: "string" },
                labelHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                recipient: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                attestor: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                validUntil: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
                signature: { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
                typedDataDigest: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                controllerAttestationHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        V3Context: {
          type: "object",
          required: ["schemaVersion", "suiteVersion", "releaseStatus", "suiteReleaseId", "chainId", "suffix", "settlement", "normalization"],
          properties: {
            schemaVersion: { type: "integer", const: 4 },
            suiteVersion: { type: "string", const: v3Manifest.suiteVersion },
            releaseStatus: { type: "string", enum: ["draft", "candidate", "live"] },
            suiteReleaseId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            chainId: { type: "integer", const: v3Manifest.chainId },
            suffix: { type: "string" },
            settlement: { type: "object" },
            normalization: { type: "object" },
          },
        },
        V3DecimalUint: {
          type: "string",
          pattern: "^(0|[1-9][0-9]*)$",
          maxLength: 78,
          description: "JSON-safe unsigned integer encoded as a decimal string.",
        },
        V3Address: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
        },
        V3NameRecord: {
          type: "object",
          required: [
            "label",
            "fullName",
            "node",
            "tokenId",
            "status",
            "owner",
            "resolvedAddress",
            "expiresAt",
            "available",
            "reserved",
            "transferNonce",
            "blockNumber",
          ],
          properties: {
            label: { type: "string" },
            fullName: { type: "string" },
            node: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            tokenId: { $ref: "#/components/schemas/V3DecimalUint" },
            status: { type: "string", enum: ["unregistered", "active", "grace", "released"] },
            owner: {
              oneOf: [{ $ref: "#/components/schemas/V3Address" }, { type: "null" }],
            },
            resolvedAddress: {
              oneOf: [{ $ref: "#/components/schemas/V3Address" }, { type: "null" }],
            },
            expiresAt: {
              oneOf: [{ $ref: "#/components/schemas/V3DecimalUint" }, { type: "null" }],
            },
            available: { type: "boolean" },
            reserved: { type: "boolean" },
            transferNonce: { $ref: "#/components/schemas/V3DecimalUint" },
            blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
          },
          additionalProperties: false,
        },
        V3OwnedNamePage: {
          type: "object",
          required: ["items", "total", "nextCursor", "blockNumber"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/V3NameRecord" } },
            total: { $ref: "#/components/schemas/V3DecimalUint" },
            nextCursor: { $ref: "#/components/schemas/V3DecimalUint" },
            blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
          },
          additionalProperties: false,
        },
        V3AddressVerification: {
          type: "object",
          required: ["address", "name", "verified", "reason", "blockNumber"],
          properties: {
            address: { $ref: "#/components/schemas/V3Address" },
            name: { oneOf: [{ type: "string" }, { type: "null" }] },
            verified: { type: "boolean" },
            reason: {
              oneOf: [
                {
                  type: "string",
                  enum: ["no-primary", "invalid-primary", "inactive", "owner-mismatch", "forward-mismatch"],
                },
                { type: "null" },
              ],
            },
            blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
          },
          additionalProperties: false,
        },
        V3AccountBalances: {
          type: "object",
          required: ["account", "referralRewards", "marketplaceClaimable", "primary", "blockNumber"],
          properties: {
            account: { $ref: "#/components/schemas/V3Address" },
            referralRewards: { $ref: "#/components/schemas/V3DecimalUint" },
            marketplaceClaimable: { $ref: "#/components/schemas/V3DecimalUint" },
            primary: { $ref: "#/components/schemas/V3AddressVerification" },
            blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
          },
          additionalProperties: false,
        },
        V3Offer: {
          type: "object",
          required: [
            "offerId",
            "tokenId",
            "buyer",
            "recipient",
            "ownerSnapshot",
            "amount",
            "deadline",
            "transferNonce",
            "feeBps",
            "state",
            "stale",
          ],
          properties: {
            offerId: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            tokenId: { $ref: "#/components/schemas/V3DecimalUint" },
            buyer: { $ref: "#/components/schemas/V3Address" },
            recipient: { $ref: "#/components/schemas/V3Address" },
            ownerSnapshot: { $ref: "#/components/schemas/V3Address" },
            amount: { $ref: "#/components/schemas/V3DecimalUint" },
            deadline: { $ref: "#/components/schemas/V3DecimalUint" },
            transferNonce: { $ref: "#/components/schemas/V3DecimalUint" },
            feeBps: { type: "integer", minimum: 0, maximum: 10000 },
            state: { type: "string", enum: ["none", "active", "refunded", "accepted"] },
            stale: { type: "boolean" },
          },
          additionalProperties: false,
        },
        V3OfferPage: {
          type: "object",
          required: ["items", "nextCursor", "blockNumber"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/V3Offer" } },
            nextCursor: { $ref: "#/components/schemas/V3DecimalUint" },
            blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
          },
          additionalProperties: false,
        },
        V3AccountEnvelope: {
          type: "object",
          required: ["data", "context"],
          properties: {
            data: {
              type: "object",
              required: ["account", "names", "balances", "buyerOffers", "ownerOffers", "blockNumber"],
              properties: {
                account: { $ref: "#/components/schemas/V3Address" },
                names: { $ref: "#/components/schemas/V3OwnedNamePage" },
                balances: { $ref: "#/components/schemas/V3AccountBalances" },
                buyerOffers: { $ref: "#/components/schemas/V3OfferPage" },
                ownerOffers: { $ref: "#/components/schemas/V3OfferPage" },
                blockNumber: { $ref: "#/components/schemas/V3DecimalUint" },
              },
              additionalProperties: false,
            },
            context: { $ref: "#/components/schemas/V3Context" },
          },
          additionalProperties: false,
        },
        V3Envelope: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "object", additionalProperties: true },
            context: { $ref: "#/components/schemas/V3Context" },
          },
        },
        V3ErrorEnvelope: {
          type: "object",
          required: ["error", "context"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "string" }, message: { type: "string" } },
              additionalProperties: true,
            },
            context: { $ref: "#/components/schemas/V3Context" },
          },
        },
      },
      responses: {
        V3BadRequest: jsonResponse("Invalid V3 path or query input.", { $ref: "#/components/schemas/V3ErrorEnvelope" }),
        V3NotFound: jsonResponse("Requested V3 resource is not effective or found.", { $ref: "#/components/schemas/V3ErrorEnvelope" }),
        V3Unavailable: jsonResponse("V3 is still a draft or its configured RPC cannot complete the verified read.", { $ref: "#/components/schemas/V3ErrorEnvelope" }),
        BadRequest: jsonResponse("Invalid path or query input.", { $ref: "#/components/schemas/ErrorEnvelope" }),
        NotFound: jsonResponse("Requested resource not found.", { $ref: "#/components/schemas/ErrorEnvelope" }),
        DeploymentOrRpcUnavailable: jsonResponse("Contract not deployed or configured RPC unavailable.", { $ref: "#/components/schemas/ErrorEnvelope" }),
        X402Failure: jsonResponse("Invalid, stale, unavailable, or operationally disabled x402 registration request.", { type: "object" }),
      },
    },
  };

  return apiJson(document, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
