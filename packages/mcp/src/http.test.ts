import type { SepbaseClient } from "@sepbase/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  handleSepbaseMcpPost,
  mcpHttpMethodNotAllowed,
  mcpHttpOptions,
} from "./http.js";
import { handleSepbaseV3McpPost } from "./v3-http.js";

function mcpRequest(
  message: unknown,
  protocolVersion?: string,
  origin?: string,
) {
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  });
  if (protocolVersion) headers.set("Mcp-Protocol-Version", protocolVersion);
  if (origin) headers.set("Origin", origin);
  return new Request("https://names.example/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });
}

function protocolClient() {
  const settlement = {
    kind: "erc20" as const,
    tokenAddress: "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945" as const,
    name: "Mock USD",
    symbol: "MUSD",
    decimals: 6,
  };
  return {
    manifest: {
      chainId: 84532,
      chainName: "Base Sepolia",
      contract: "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945",
      suffix: "sepbase",
      nameRules: { minLength: 1, maxLength: 32, allowedYears: [1, 2, 3, 4, 5] },
      settlement,
    },
    getProtocolHealth: vi.fn(async () => ({
      settlementBalance: 1_500_000n,
      protectedLiability: 500_000n,
      solvent: true,
      blockNumber: 123n,
    })),
    getSettlementAsset: vi.fn(async () => settlement),
  } as unknown as SepbaseClient;
}

describe("stateless Streamable HTTP", () => {
  it("exposes V3 through a separate opt-in handler without changing the legacy handler", async () => {
    const factory = vi.fn(async () => {
      throw new Error("V3 tool discovery must not construct a client.");
    });
    const response = await handleSepbaseV3McpPost(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, "2025-11-25"),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service-v3.json",
        clientFactory: factory,
      },
    );
    const body = await response.json() as {
      result: { tools: Array<{ name: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.result.tools).toHaveLength(39);
    expect(body.result.tools.map((tool) => tool.name)).toContain("registration_requirements");
    expect(body.result.tools.map((tool) => tool.name)).not.toContain("prepare_registration");
    expect(factory).not.toHaveBeenCalled();
  });

  it("negotiates without creating an MCP session", async () => {
    const response = await handleSepbaseMcpPost(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service.json",
        clientFactory: async () => protocolClient(),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "sepbase-name-service", version: "0.1.0" },
      },
    });
  });

  it("serves tool calls on independent stateless requests", async () => {
    const factory = vi.fn(async () => protocolClient());
    const listResponse = await handleSepbaseMcpPost(
      mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, "2025-11-25"),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service.json",
        clientFactory: factory,
      },
    );
    const listed = await listResponse.json() as {
      result: { tools: Array<{ name: string }> };
    };

    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      "resolve_name",
      "reverse_resolve",
      "check_availability",
      "name_info",
      "quote_registration",
      "market_listings",
      "protocol_health",
      "prepare_registration",
    ]);
    expect(factory).not.toHaveBeenCalled();

    const callResponse = await handleSepbaseMcpPost(
      mcpRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "protocol_health", arguments: {} },
      }, "2025-11-25"),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service.json",
        clientFactory: factory,
      },
    );
    const called = await callResponse.json() as {
      result: { isError?: boolean; structuredContent: { ok: boolean; data: Record<string, unknown> } };
    };

    expect(called.result.isError).not.toBe(true);
    expect(called.result.structuredContent).toEqual({
      ok: true,
      data: expect.objectContaining({
        settlementBalanceBaseUnits: "1500000",
        protectedLiabilityBaseUnits: "500000",
        formattedSettlementBalance: "1.5",
        solvent: true,
      }),
    });
    expect(factory).toHaveBeenCalledOnce();
  });

  it("rejects session transports and advertises only POST plus OPTIONS", async () => {
    const methodResponse = mcpHttpMethodNotAllowed();
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST, OPTIONS");

    const optionsResponse = mcpHttpOptions();
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });

  it("rejects browser origins outside the explicit allowlist", async () => {
    const response = await handleSepbaseMcpPost(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        "2025-11-25",
        "https://evil.example",
      ),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service.json",
        allowedRequestOrigins: ["https://names.example"],
        clientFactory: async () => protocolClient(),
      },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Forbidden origin." },
    });
  });

  it("accepts the configured browser origin and origin-less server clients", async () => {
    for (const origin of ["https://names.example", undefined]) {
      const response = await handleSepbaseMcpPost(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
          "2025-11-25",
          origin,
        ),
        {
          manifestUrl: "https://names.example/.well-known/chain-name-service.json",
          allowedRequestOrigins: ["https://names.example"],
          clientFactory: async () => protocolClient(),
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin ?? null);
    }
  });

  it("rejects oversized request bodies before MCP parsing", async () => {
    const response = await handleSepbaseMcpPost(
      new Request("https://names.example/api/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: "x".repeat(64 * 1024) }),
      }),
      {
        manifestUrl: "https://names.example/.well-known/chain-name-service.json",
        clientFactory: async () => protocolClient(),
      },
    );

    expect(response.status).toBe(413);
  });

  it("rejects JSON-RPC batches and malformed JSON before the SDK transport", async () => {
    const options = {
      manifestUrl: "https://names.example/.well-known/chain-name-service.json",
      clientFactory: async () => protocolClient(),
    };
    const batch = await handleSepbaseMcpPost(
      mcpRequest([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      ], "2025-11-25"),
      options,
    );
    const malformed = await handleSepbaseMcpPost(
      new Request("https://names.example/api/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: "{",
      }),
      options,
    );

    for (const response of [batch, malformed]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: -32600,
          message: "MCP Streamable HTTP accepts exactly one JSON-RPC message per POST.",
        },
      });
    }
  });
});
