import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createSepbaseV3Client,
  type SepbaseV3Client,
} from "@sepbase/sdk";
import { z } from "zod/v4";
import {
  createSepbaseV3ToolHandlers,
  type SepbaseV3ToolHandlers,
} from "./v3-tools.js";
import type { ToolOutcome } from "./tools.js";

export type CreateSepbaseV3ClientOptions = Parameters<typeof createSepbaseV3Client>[0];

export type SepbaseV3ClientFactory = (
  options: CreateSepbaseV3ClientOptions,
) => Promise<SepbaseV3Client>;

export type CreateSepbaseV3McpServerOptions = CreateSepbaseV3ClientOptions & {
  allowedRequestOrigins?: readonly string[];
  clientFactory?: SepbaseV3ClientFactory;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const nameSchema = z.string().min(1).max(255)
  .describe("Label or full name for the configured SEPBASE V3 suffix.");
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .describe("EVM address.");
const decimalUintSchema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/)
  .describe("Non-negative decimal integer; returned values use the same JSON-safe form.");
const positiveDecimalSchema = z.string().regex(/^[1-9][0-9]{0,77}$/)
  .describe("Positive settlement base-unit amount as a decimal integer.");
const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .describe("32-byte hex identifier.");
const durationSchema = z.number().int().min(1).max(5)
  .describe("Registration duration in protocol years.");
const cursorSchema = decimalUintSchema.optional()
  .describe("Opaque decimal cursor returned by the previous page.");
const limitSchema = z.number().int().min(1).max(50).optional()
  .describe("Maximum number of items, from 1 to 50.");

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

function clientOptions(options: CreateSepbaseV3McpServerOptions): CreateSepbaseV3ClientOptions {
  return {
    manifestUrl: options.manifestUrl,
    ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.allowedManifestOrigins
      ? { allowedManifestOrigins: options.allowedManifestOrigins }
      : {}),
    ...(options.allowedRpcOrigins ? { allowedRpcOrigins: options.allowedRpcOrigins } : {}),
  };
}

function registerReadTools(server: McpServer, tools: SepbaseV3ToolHandlers) {
  server.registerTool(
    "normalize",
    {
      title: "Normalize a SEPBASE V3 name",
      description:
        "Apply the suite's ENSIP-15 profile and return the canonical label, node, label hash, and JSON-safe token ID.",
      inputSchema: { name: nameSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.normalize(input)),
  );

  server.registerTool(
    "name_info",
    {
      title: "Read SEPBASE V3 name state",
      description:
        "Read lifecycle, effective owner and resolution, reservation, availability, expiry, and transfer nonce at one block.",
      inputSchema: { name: nameSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.nameInfo(input)),
  );

  server.registerTool(
    "resolve_name",
    {
      title: "Resolve a SEPBASE V3 name",
      description:
        "Return an effective forward resolution only while the configured V3 name is active or in grace.",
      inputSchema: { name: nameSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.resolveName(input)),
  );

  server.registerTool(
    "resolve_text",
    {
      title: "Read a SEPBASE V3 text record",
      description:
        "Read one text record at the same block as lifecycle verification; released names fail closed to null.",
      inputSchema: {
        name: nameSchema,
        key: z.string().min(1).max(64).describe("Resolver text-record key."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.resolveText(input)),
  );

  server.registerTool(
    "reverse",
    {
      title: "Reverse-resolve a SEPBASE V3 address",
      description:
        "Return a primary name only when same-block forward resolution, live ownership, and lifecycle all confirm the account.",
      inputSchema: { address: addressSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.reverse(input)),
  );

  server.registerTool(
    "owned_names",
    {
      title: "Read names owned by a SEPBASE V3 account",
      description: "Read a bounded ERC-721 owner-enumeration page and verify every name record at one pinned block.",
      inputSchema: { account: addressSchema, cursor: cursorSchema, limit: limitSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.ownedNames(input)),
  );

  server.registerTool(
    "account_balances",
    {
      title: "Read SEPBASE V3 account balances",
      description: "Read referral rewards, marketplace proceeds/refunds, and forward-confirmed primary identity at one block. Unavailable reads are errors, not zero balances.",
      inputSchema: { account: addressSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.accountBalances(input)),
  );

  server.registerTool(
    "quote_registration",
    {
      title: "Quote SEPBASE V3 registration",
      description:
        "Read the guarded quote in configured settlement base units and the name's availability state at one block.",
      inputSchema: { name: nameSchema, durationYears: durationSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.quoteRegistration(input)),
  );

  server.registerTool(
    "registration_requirements",
    {
      title: "Read SEPBASE V3 registration requirements",
      description:
        "Return canonical normalization, attestation typed-data fields, commit timing, economic guards, and x402 routing. This requirements-only tool accepts no attestor output, wallet credential, or x402 authorization and prepares no registration transaction.",
      inputSchema: {
        name: nameSchema,
        durationYears: durationSchema,
        recipient: addressSchema.describe("Intended V3 name owner and attestation recipient."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.registrationRequirements(input)),
  );

  server.registerTool(
    "market_listings",
    {
      title: "Read SEPBASE V3 listings",
      description: "Read a bounded MarketLens page of active fixed-price listings.",
      inputSchema: { cursor: cursorSchema, limit: limitSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.listings(input)),
  );

  server.registerTool(
    "global_offers",
    {
      title: "Read global SEPBASE V3 offers",
      description: "Read a bounded MarketLens page of global offers, with terminal states excluded by default.",
      inputSchema: {
        cursor: cursorSchema,
        limit: limitSchema,
        includeTerminal: z.boolean().optional().describe("Include refunded and accepted offers."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.globalOffers(input)),
  );

  server.registerTool(
    "buyer_offers",
    {
      title: "Read a buyer's SEPBASE V3 offers",
      description: "Read a bounded MarketLens page filtered by buyer.",
      inputSchema: {
        buyer: addressSchema,
        cursor: cursorSchema,
        limit: limitSchema,
        includeTerminal: z.boolean().optional().describe("Include refunded and accepted offers."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.buyerOffers(input)),
  );

  server.registerTool(
    "owner_offers",
    {
      title: "Read offers on an owner's SEPBASE V3 names",
      description: "Read a bounded MarketLens page filtered by current owner.",
      inputSchema: {
        owner: addressSchema,
        cursor: cursorSchema,
        limit: limitSchema,
        includeTerminal: z.boolean().optional().describe("Include refunded and accepted offers."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.ownerOffers(input)),
  );

  server.registerTool(
    "market_auctions",
    {
      title: "Read SEPBASE V3 auctions",
      description: "Read a bounded MarketLens page of active English auctions.",
      inputSchema: { cursor: cursorSchema, limit: limitSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.auctions(input)),
  );

  server.registerTool(
    "protocol_liabilities",
    {
      title: "Read SEPBASE V3 liabilities",
      description:
        "Read controller, marketplace, referral, seller, offer, and auction liabilities plus suite solvency at one block.",
      annotations: readOnlyAnnotations,
    },
    async () => asMcpResult(await tools.liabilities()),
  );

  server.registerTool(
    "migration_status",
    {
      title: "Read SEPBASE V3 migration status",
      description:
        "Read the live migration window, pause state, source contract, optional per-name reservation, and optional account-scoped claim eligibility at one block.",
      inputSchema: {
        name: nameSchema.optional(),
        account: addressSchema.optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.migrationStatus(input)),
  );
}

function registerPlanTools(server: McpServer, tools: SepbaseV3ToolHandlers) {
  const planDescription =
    "Return a block-pinned, guarded, unsigned transaction plan for independent wallet review and simulation. The server cannot sign, send, or initiate settlement.";

  server.registerTool(
    "prepare_renewal",
    {
      title: "Prepare V3 renewal",
      description: planDescription,
      inputSchema: {
        owner: addressSchema,
        tokenId: decimalUintSchema,
        durationYears: durationSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareRenewal(input)),
  );

  server.registerTool(
    "prepare_marketplace_approval",
    {
      title: "Prepare per-name V3 marketplace approval",
      description: `${planDescription} This grants only the verified marketplace permission for one token ID.`,
      inputSchema: { owner: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareMarketplaceApproval(input)),
  );

  server.registerTool(
    "prepare_listing",
    {
      title: "Prepare V3 listing",
      description: planDescription,
      inputSchema: {
        seller: addressSchema,
        tokenId: decimalUintSchema,
        price: positiveDecimalSchema,
        deadline: decimalUintSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareListing(input)),
  );

  server.registerTool(
    "prepare_listing_update",
    {
      title: "Prepare V3 listing update",
      description: planDescription,
      inputSchema: {
        seller: addressSchema,
        tokenId: decimalUintSchema,
        newPrice: positiveDecimalSchema,
        newDeadline: decimalUintSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareListingUpdate(input)),
  );

  server.registerTool(
    "prepare_listing_cancel",
    {
      title: "Prepare V3 listing cancellation",
      description: planDescription,
      inputSchema: { seller: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareListingCancel(input)),
  );

  server.registerTool(
    "prepare_listing_invalidate",
    {
      title: "Prepare stale V3 listing cleanup",
      description: planDescription,
      inputSchema: { caller: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareListingInvalidate(input)),
  );

  server.registerTool(
    "prepare_buy",
    {
      title: "Prepare V3 fixed-price purchase",
      description: planDescription,
      inputSchema: {
        buyer: addressSchema,
        tokenId: decimalUintSchema,
        recipient: addressSchema.optional().describe("Optional recipient; defaults to buyer."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareBuy(input)),
  );

  server.registerTool(
    "prepare_offer",
    {
      title: "Prepare V3 offer",
      description: planDescription,
      inputSchema: {
        buyer: addressSchema,
        tokenId: decimalUintSchema,
        recipient: addressSchema.optional().describe("Optional recipient; defaults to buyer."),
        amount: positiveDecimalSchema,
        deadline: decimalUintSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareOffer(input)),
  );

  server.registerTool(
    "prepare_offer_accept",
    {
      title: "Prepare V3 offer acceptance",
      description: planDescription,
      inputSchema: { seller: addressSchema, offerId: bytes32Schema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareOfferAccept(input)),
  );

  server.registerTool(
    "prepare_offer_cancel",
    {
      title: "Prepare V3 offer cancellation",
      description: planDescription,
      inputSchema: { buyer: addressSchema, offerId: bytes32Schema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareOfferCancel(input)),
  );

  server.registerTool(
    "prepare_offer_invalidate",
    {
      title: "Prepare V3 stale-offer invalidation",
      description: planDescription,
      inputSchema: { caller: addressSchema, offerId: bytes32Schema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareOfferInvalidate(input)),
  );

  server.registerTool(
    "prepare_auction_start",
    {
      title: "Prepare V3 auction start",
      description: planDescription,
      inputSchema: {
        seller: addressSchema,
        tokenId: decimalUintSchema,
        reservePrice: positiveDecimalSchema,
        startAt: decimalUintSchema,
        endAt: decimalUintSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareAuctionStart(input)),
  );

  server.registerTool(
    "prepare_auction_cancel",
    {
      title: "Prepare V3 auction cancellation",
      description: planDescription,
      inputSchema: { seller: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareAuctionCancel(input)),
  );

  server.registerTool(
    "prepare_bid",
    {
      title: "Prepare V3 auction bid",
      description: planDescription,
      inputSchema: {
        bidder: addressSchema,
        tokenId: decimalUintSchema,
        recipient: addressSchema.optional().describe("Optional recipient; defaults to bidder."),
        amount: positiveDecimalSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareBid(input)),
  );

  server.registerTool(
    "prepare_auction_finalize",
    {
      title: "Prepare V3 auction finalization",
      description: planDescription,
      inputSchema: { caller: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareAuctionFinalize(input)),
  );

  server.registerTool(
    "prepare_marketplace_claim",
    {
      title: "Prepare V3 marketplace proceeds claim",
      description: planDescription,
      inputSchema: {
        account: addressSchema,
        recipient: addressSchema.optional().describe("Optional claim recipient; defaults to account."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareMarketplaceClaim(input)),
  );

  server.registerTool(
    "prepare_referral_claim",
    {
      title: "Prepare V3 referral reward claim",
      description: planDescription,
      inputSchema: {
        account: addressSchema,
        recipient: addressSchema.optional().describe("Optional claim recipient; defaults to account."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareReferralClaim(input)),
  );

  server.registerTool(
    "prepare_text_record",
    {
      title: "Prepare V3 text-record update",
      description: planDescription,
      inputSchema: {
        owner: addressSchema,
        name: nameSchema,
        key: z.string().min(1).max(64),
        value: z.string().max(512),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareTextRecord(input)),
  );

  server.registerTool(
    "prepare_address_record",
    {
      title: "Prepare V3 address-record update",
      description: planDescription,
      inputSchema: { owner: addressSchema, name: nameSchema, target: addressSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareAddressRecord(input)),
  );

  server.registerTool(
    "prepare_primary_name",
    {
      title: "Prepare V3 primary-name update",
      description: planDescription,
      inputSchema: { owner: addressSchema, tokenId: decimalUintSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.preparePrimaryName(input)),
  );

  server.registerTool(
    "prepare_primary_name_clear",
    {
      title: "Prepare V3 primary-name clear",
      description: planDescription,
      inputSchema: { owner: addressSchema },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.preparePrimaryNameClear(input)),
  );

  server.registerTool(
    "prepare_transfer",
    {
      title: "Prepare V3 name transfer",
      description: planDescription,
      inputSchema: {
        owner: addressSchema,
        recipient: addressSchema,
        tokenId: decimalUintSchema,
        safe: z.boolean().optional().describe("Use safeTransferFrom unless explicitly false."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareTransfer(input)),
  );

  server.registerTool(
    "prepare_migration_claim",
    {
      title: "Prepare V3 legacy-name migration",
      description: planDescription,
      inputSchema: {
        caller: addressSchema,
        legacyLabel: nameSchema,
        recipient: addressSchema,
        expectedLegacyOwner: addressSchema,
        importLegacyResolution: z.boolean(),
        expectedLegacyResolution: addressSchema.optional()
          .describe("Required guard only when importing the legacy resolution."),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => asMcpResult(await tools.prepareMigrationClaim(input)),
  );
}

/**
 * Creates the opt-in V3 MCP surface. The existing createSepbaseMcpServer export
 * remains the hosted legacy surface until the application explicitly switches.
 */
export function createSepbaseV3McpServer(options: CreateSepbaseV3McpServerOptions) {
  const server = new McpServer({
    name: "sepbase-v3-name-service",
    version: "0.1.0",
  });
  const factory = options.clientFactory ?? createSepbaseV3Client;
  let pendingClient: Promise<SepbaseV3Client> | undefined;
  const getClient = () => {
    if (!pendingClient) {
      pendingClient = factory(clientOptions(options)).catch((error: unknown) => {
        pendingClient = undefined;
        throw error;
      });
    }
    return pendingClient;
  };
  const tools = createSepbaseV3ToolHandlers(getClient);
  registerReadTools(server, tools);
  registerPlanTools(server, tools);
  return server;
}
