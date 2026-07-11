import { describe, expect, it } from "vitest";
import { GET as getName } from "./name/[label]/route";
import { GET as getOpenApi } from "./openapi.json/route";
import { GET as getManifest } from "../.well-known/chain-name-service.json/route";
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
      components: { schemas: { ReverseEnvelope: { properties: { data: { properties: Record<string, unknown> } } } } };
    };
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.components.schemas.ReverseEnvelope.properties.data.properties).toHaveProperty("verified");
  });
});
