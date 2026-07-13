import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SepbaseV3Client } from "@sepbase/sdk";
import { describe, expect, it, vi } from "vitest";
import { createSepbaseMcpServer } from "./server.js";
import { createSepbaseV3McpServer } from "./v3-server.js";

const toolNames = [
  "normalize",
  "name_info",
  "resolve_name",
  "resolve_text",
  "reverse",
  "owned_names",
  "account_balances",
  "quote_registration",
  "registration_requirements",
  "market_listings",
  "global_offers",
  "buyer_offers",
  "owner_offers",
  "market_auctions",
  "protocol_liabilities",
  "migration_status",
  "prepare_renewal",
  "prepare_marketplace_approval",
  "prepare_listing",
  "prepare_listing_update",
  "prepare_listing_cancel",
  "prepare_listing_invalidate",
  "prepare_buy",
  "prepare_offer",
  "prepare_offer_accept",
  "prepare_offer_cancel",
  "prepare_offer_invalidate",
  "prepare_auction_start",
  "prepare_auction_cancel",
  "prepare_bid",
  "prepare_auction_finalize",
  "prepare_marketplace_claim",
  "prepare_referral_claim",
  "prepare_text_record",
  "prepare_address_record",
  "prepare_primary_name",
  "prepare_primary_name_clear",
  "prepare_transfer",
  "prepare_migration_claim",
] as const;

describe("SEPBASE V3 MCP server", () => {
  it("publishes the complete opt-in V3 surface without constructing a client for discovery", async () => {
    const factory = vi.fn(async () => {
      throw new Error("Tool discovery must stay lazy.");
    });
    const server = createSepbaseV3McpServer({
      manifestUrl: "https://names.example/.well-known/chain-name-service-v3.json",
      clientFactory: factory,
    });
    const protocolClient = new Client({ name: "v3-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await protocolClient.connect(clientTransport);
    const result = await protocolClient.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual(toolNames);
    expect(result.tools).toHaveLength(39);
    expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(result.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);
    expect(factory).not.toHaveBeenCalled();

    const requirements = result.tools.find((tool) => tool.name === "registration_requirements");
    expect(requirements?.inputSchema.properties).toMatchObject({
      name: expect.any(Object),
      durationYears: expect.any(Object),
      recipient: expect.any(Object),
    });
    expect(Object.keys(requirements?.inputSchema.properties ?? {})).toEqual([
      "name",
      "durationYears",
      "recipient",
    ]);

    const schemas = JSON.stringify(result.tools.map((tool) => tool.inputSchema)).toLowerCase();
    for (const forbidden of [
      "privatekey",
      "paymentpayload",
      "attestationsignature",
      "commitmentsecret",
    ]) {
      expect(schemas).not.toContain(forbidden);
    }

    await protocolClient.close();
    await server.close();
  });

  it("keeps the existing hosted legacy factory intact", () => {
    const legacy = createSepbaseMcpServer({
      manifestUrl: "https://names.example/.well-known/chain-name-service.json",
      clientFactory: async () => ({} as never),
    });
    const v3 = createSepbaseV3McpServer({
      manifestUrl: "https://names.example/.well-known/chain-name-service-v3.json",
      clientFactory: async () => ({} as SepbaseV3Client),
    });

    expect(legacy).not.toBe(v3);
  });
});
