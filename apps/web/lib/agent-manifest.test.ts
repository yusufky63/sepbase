import { describe, expect, it } from "vitest";
import { projectConfig } from "@/config/project.config";
import { agentIntegrationManifest } from "./agent-manifest";
import { agentIntegrationManifestSchema } from "./agent-manifest.schema";
import { deploymentManifest } from "./deployment-manifest";

describe("agent integration manifest", () => {
  it("stays scoped to the canonical deployment", () => {
    expect(agentIntegrationManifest.schemaVersion).toBe(4);
    expect(agentIntegrationManifest.protocol).toMatchObject({
      chainId: deploymentManifest.chainId,
      chainName: deploymentManifest.chainName,
      testnet: deploymentManifest.testnet,
      suffix: deploymentManifest.suffix,
      contract: deploymentManifest.contract,
    });
  });

  it("publishes the configured agent endpoints and no signing authority", () => {
    expect(agentIntegrationManifest.discovery.deploymentManifest)
      .toBe(projectConfig.integration.wellKnownPath);
    expect(agentIntegrationManifest.discovery.v3TargetManifest)
      .toBe("/deployment-manifest.v3.json");
    expect(agentIntegrationManifest.discovery.v3Status).toBe("/api/v3/status");
    expect(agentIntegrationManifest.discovery.v3Market).toBe("/api/v3/market");
    expect(agentIntegrationManifest.discovery.v3Mcp).toBe("/api/v3/mcp");
    expect(agentIntegrationManifest.discovery.v3NormalizationAttestation)
      .toBe("/api/v3/normalization-attestation");
    expect(agentIntegrationManifest.discovery.v3Account).toBe("/api/v3/account/{address}");
    expect(agentIntegrationManifest.mcp.endpoint).toBe(projectConfig.integration.mcpPath);
    expect(agentIntegrationManifest.mcp.protocolVersion).toBe("2025-11-25");
    expect(agentIntegrationManifest.mcp.requestOriginPolicy)
      .toBe("configured-origin-or-no-origin");
    expect(agentIntegrationManifest.mcp.transactionAuthority).toBe("none");
    expect(agentIntegrationManifest.x402.quoteEndpoint)
      .toBe(projectConfig.integration.x402QuotePath);
    expect(agentIntegrationManifest.x402.resourceEndpoint)
      .toBe(projectConfig.integration.x402RegisterPath);
    expect(agentIntegrationManifest.x402.statusEndpoint)
      .toBe("/api/x402/registration/status");
    expect(agentIntegrationManifest.x402.defaultEnabled).toBe(false);
    expect(agentIntegrationManifest.x402.availability).toBe("fail-closed");
    expect(agentIntegrationManifest.x402.implementationStatus).toBe("activation-gated");
    expect(agentIntegrationManifest.x402.paidExecutionAvailable).toBe(false);
    expect(agentIntegrationManifest.x402.pinnedPackages).toEqual({
      "@x402/core": "2.18.0",
      "@x402/evm": "2.18.0",
      "@x402/extensions": "2.18.0",
      workflow: "4.6.0",
    });
    expect(agentIntegrationManifest.x402.settlementTarget).toMatchObject({
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      testnetValueDisclaimer: true,
    });
    expect(agentIntegrationManifest.x402.registrationScope).toContain("quoteId");
    expect(agentIntegrationManifest.x402.paymentAcceptanceScope).toContain("asset");
    expect(agentIntegrationManifest.x402.idempotencyScope).toContain("paymentIdentifier");
  });

  it("rejects cross-origin and encoded traversal routes", () => {
    expect(() => agentIntegrationManifestSchema.parse({
      ...agentIntegrationManifest,
      mcp: { ...agentIntegrationManifest.mcp, endpoint: "//internal.example/mcp" },
    })).toThrow(/same-origin/i);
    expect(() => agentIntegrationManifestSchema.parse({
      ...agentIntegrationManifest,
      discovery: { ...agentIntegrationManifest.discovery, openApi: "/%2e%2e/openapi" },
    })).toThrow(/traversal/i);
  });

  it("accepts only internally consistent fail-closed or operational x402 states", () => {
    expect(() => agentIntegrationManifestSchema.parse({
      ...agentIntegrationManifest,
      x402: { ...agentIntegrationManifest.x402, paidExecutionAvailable: true },
    })).toThrow(/operational runtime/i);

    expect(() => agentIntegrationManifestSchema.parse({
      ...agentIntegrationManifest,
      x402: {
        ...agentIntegrationManifest.x402,
        availability: "available",
        implementationStatus: "operational",
        paidExecutionAvailable: true,
        settlementTarget: {
          ...agentIntegrationManifest.x402.settlementTarget,
          status: "live",
        },
      },
    })).not.toThrow();
  });
});
