import { projectConfig } from "@/config/project.config";
import { apiJson, OPTIONS } from "@/lib/api-response";
import { deploymentManifest } from "@/lib/deployment-manifest";

export { OPTIONS };

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
      title: `${projectConfig.brand.name} read API`,
      version: deploymentManifest.contractVersion,
      description: `Read-only, RPC-backed access to .${projectConfig.brand.suffix} names. Integer asset amounts are decimal base-unit strings.`,
    },
    servers: [{ url: projectConfig.siteUrl }],
    tags: [
      { name: "Names", description: "Registry records and resolution." },
      { name: "Market", description: "Validated fixed-price listings." },
      { name: "NFT", description: "ERC-721 metadata and deterministic images." },
    ],
    paths: {
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
        Label: {
          name: "label",
          in: "path",
          required: true,
          description: `Canonical label, optionally ending in .${projectConfig.brand.suffix}.`,
          schema: {
            type: "string",
            minLength: deploymentManifest.nameRules.minLength,
            maxLength: deploymentManifest.nameRules.maxLength + deploymentManifest.suffix.length + 1,
          },
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
      },
      schemas: {
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
      },
      responses: {
        BadRequest: jsonResponse("Invalid path or query input.", { $ref: "#/components/schemas/ErrorEnvelope" }),
        NotFound: jsonResponse("Requested resource not found.", { $ref: "#/components/schemas/ErrorEnvelope" }),
        DeploymentOrRpcUnavailable: jsonResponse("Contract not deployed or configured RPC unavailable.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      },
    },
  };

  return apiJson(document, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
