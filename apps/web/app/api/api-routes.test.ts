import { describe, expect, it } from "vitest";
import { GET as getName } from "./name/[label]/route";
import { GET as getOpenApi } from "./openapi.json/route";
import { GET as getManifest } from "../.well-known/chain-name-service.json/route";
import { GET as getV3Name } from "./v3/name/[label]/route";
import { GET as getV3Resolve } from "./v3/resolve/[label]/route";
import { GET as getV3Status } from "./v3/status/route";
import { deploymentPending } from "@/lib/api-response";

describe("public API contracts", () => {
  it("returns a stable NOT_DEPLOYED envelope for contract reads", async () => {
    const response = deploymentPending();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_DEPLOYED" } });
  });

  it("rejects non-canonical machine labels before chain access", async () => {
    const response = await getName(
      new Request("http://localhost:3000/api/name/Alice.sepbase"),
      { params: Promise.resolve({ label: "Alice.sepbase" }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT", normalizedSuggestion: "alice" },
    });
  });

  it("keeps discovery and OpenAPI available in every deployment state", async () => {
    const manifestResponse = getManifest();
    expect(manifestResponse.status).toBe(200);
    const manifest = await manifestResponse.json() as { schemaVersion: number; contract: string | null };
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.contract === null || /^0x[a-fA-F0-9]{40}$/.test(manifest.contract)).toBe(true);

    const openApiResponse = getOpenApi();
    expect(openApiResponse.status).toBe(200);
    const openApi = await openApiResponse.json() as {
      openapi: string;
      info: { version: string };
      paths: Record<string, {
        get?: { responses?: Record<string, unknown> };
        post?: { responses?: Record<string, unknown> };
      }>;
      components: {
        parameters: { Label: { description: string; schema: { maxLength: number } } };
        schemas: {
          ReverseEnvelope: { properties: { data: { properties: Record<string, unknown> } } };
          X402RegistrationQuote: { required: string[]; properties: Record<string, unknown> };
          X402Readiness: { properties: Record<string, { const?: unknown; enum?: unknown[] }> };
          V3AccountEnvelope: {
            properties: {
              data: { required: string[]; properties: Record<string, unknown> };
            };
          };
          V3DecimalUint: { maxLength: number; pattern: string };
        };
      };
    };
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.info.version).toBe("1.7.0");
    expect(openApi.components.schemas.ReverseEnvelope.properties.data.properties).toHaveProperty("verified");
    expect(openApi.components.parameters.Label.description).toContain("without the");
    expect(openApi.components.parameters.Label.schema.maxLength).toBe(32);
    expect(openApi.components.schemas.X402Readiness.properties).toHaveProperty("implementationStatus");
    expect(openApi.components.schemas.X402Readiness.properties.implementationStatus?.enum)
      .toEqual(["activation-gated", "operational"]);
    expect(openApi.components.schemas.X402RegistrationQuote.required).toContain("authentication");
    expect(openApi.components.schemas.X402RegistrationQuote.properties).toHaveProperty("authentication");
    expect(openApi.components.schemas.V3AccountEnvelope.properties.data.required)
      .toEqual(expect.arrayContaining(["names", "balances", "buyerOffers", "ownerOffers", "blockNumber"]));
    expect(openApi.components.schemas.V3AccountEnvelope.properties.data.properties)
      .toHaveProperty("account");
    expect(openApi.components.schemas.V3DecimalUint.maxLength).toBe(78);
    expect(openApi.paths["/api/mcp"]?.post?.responses).toHaveProperty("403");
    expect(openApi.paths["/api/mcp"]?.post?.responses).toHaveProperty("413");
    expect(openApi.paths["/api/x402/registration/quote"]?.post?.responses).toHaveProperty("200");
    expect(openApi.paths["/api/x402/registration"]?.post?.responses).toHaveProperty("402");
    expect(openApi.paths["/api/x402/registration/status"]?.get?.responses).toHaveProperty("404");
    expect(openApi.paths["/api/v3/mcp"]?.post?.responses).toHaveProperty("403");
    expect(openApi.paths["/api/v3/mcp"]?.post?.responses).toHaveProperty("413");
    expect(openApi.paths["/api/v3/normalization-attestation"]?.post?.responses)
      .toHaveProperty("503");
    expect(openApi.paths["/api/v3/account/{address}"]?.get?.responses).toHaveProperty("200");
    expect(openApi.paths).toHaveProperty("/api/v3/status");
    expect(openApi.paths).toHaveProperty("/api/v3/market");
  });

  it("publishes seven-module V3 draft discovery without pretending it is deployed", async () => {
    const statusResponse = getV3Status();
    expect(statusResponse.status).toBe(200);
    const status = await statusResponse.json() as {
      data: {
        releaseStatus: string;
        contracts: Record<string, { address: string | null }>;
        capabilities: { paidX402: boolean };
        x402: { paidExecutionAvailable: boolean };
      };
    };
    expect(status.data.releaseStatus).toBe("draft");
    expect(Object.keys(status.data.contracts)).toHaveLength(7);
    expect(Object.values(status.data.contracts).every((module) => module.address === null)).toBe(true);
    expect(status.data.capabilities.paidX402).toBe(false);
    expect(status.data.x402.paidExecutionAvailable).toBe(false);

    const nonCanonical = await getV3Name(
      new Request("http://localhost:3000/api/v3/name/Alice.sepbase"),
      { params: Promise.resolve({ label: "Alice.sepbase" }) },
    );
    expect(nonCanonical.status).toBe(400);
    await expect(nonCanonical.json()).resolves.toMatchObject({
      error: { code: "NON_CANONICAL_INPUT", normalizedSuggestion: "alice" },
    });

    const invalidTextKey = await getV3Resolve(
      new Request("http://localhost:3000/api/v3/resolve/alice?textKey="),
      { params: Promise.resolve({ label: "alice" }) },
    );
    expect(invalidTextKey.status).toBe(400);
    await expect(invalidTextKey.json()).resolves.toMatchObject({
      error: { code: "INVALID_TEXT_KEY" },
    });

    const pending = await getV3Name(
      new Request("http://localhost:3000/api/v3/name/alice"),
      { params: Promise.resolve({ label: "alice" }) },
    );
    expect(pending.status).toBe(503);
    await expect(pending.json()).resolves.toMatchObject({ error: { code: "V3_NOT_DEPLOYED" } });
  });
});
