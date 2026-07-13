import { describe, expect, it } from "vitest";
import {
  collectReleaseGateIssues,
  type ReleaseGateInput,
} from "../../../scripts/release-check";

const address = "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945";

function validInput(overrides: Partial<ReleaseGateInput> = {}): ReleaseGateInput {
  return {
    explicitSiteUrl: "https://names.example",
    publicRpcUrl: "https://public-rpc.example",
    serverRpcUrl: "https://private-rpc.example",
    walletConnectProjectId: "project-id",
    metadataBaseURI: "https://names.example/api/metadata/",
    expectedMetadataBaseURI: "https://names.example/api/metadata/",
    contract: address,
    settlementKind: "erc20",
    settlementTokenAddress: address,
    x402RegistrationEnabled: "false",
    x402FacilitatorUrl: undefined,
    x402PayToAddress: undefined,
    x402PaymentAssetAddress: undefined,
    x402KeeperAddress: undefined,
    x402KeeperSignerProvider: undefined,
    x402IdempotencyStoreUrl: undefined,
    x402KeeperPrivateKey: undefined,
    x402QuoteTtlSeconds: undefined,
    x402PaidExecutionImplemented: true,
    x402ReadinessBlockers: [],
    ...overrides,
  };
}

describe("release gates", () => {
  it("reports an invalid site URL instead of throwing", () => {
    expect(collectReleaseGateIssues(validInput({ explicitSiteUrl: "not a URL" })))
      .toContain("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  });

  it("never treats environment configuration as an operational paid x402 release", () => {
    const issues = collectReleaseGateIssues(validInput({
      x402RegistrationEnabled: "true",
      x402FacilitatorUrl: "https://facilitator.example",
      x402PayToAddress: address,
      x402PaymentAssetAddress: address,
      x402KeeperAddress: address,
      x402KeeperSignerProvider: "external",
      x402IdempotencyStoreUrl: "rediss://store.example",
      x402ReadinessBlockers: ["NOT_DEPLOYED"],
    }));

    expect(issues).toContain("Paid x402 readiness blocker: NOT_DEPLOYED.");
  });

  it("rejects credential-bearing facilitator URLs", () => {
    const issues = collectReleaseGateIssues(validInput({
      x402RegistrationEnabled: "true",
      x402FacilitatorUrl: "https://user:secret@facilitator.example?token=secret",
      x402PayToAddress: address,
      x402PaymentAssetAddress: address,
      x402KeeperAddress: address,
      x402KeeperSignerProvider: "external",
      x402IdempotencyStoreUrl: "rediss://store.example",
    }));

    expect(issues).toContain(
      "X402_FACILITATOR_URL must not embed credentials, query parameters, or fragments.",
    );
  });

  it("rejects RPC endpoints that only disguise the public provider with path changes", () => {
    const issues = collectReleaseGateIssues(validInput({
      publicRpcUrl: "https://rpc.example/public",
      serverRpcUrl: "https://rpc.example/private/",
    }));

    expect(issues).toContain(
      "RPC_URL must use a separate provider origin from the browser-visible public RPC URL.",
    );
  });

  it("validates quote TTL even while paid execution is disabled", () => {
    expect(collectReleaseGateIssues(validInput({ x402QuoteTtlSeconds: "14" }))).toContain(
      "X402_QUOTE_TTL_SECONDS must be between 15 and 300 seconds.",
    );
    expect(collectReleaseGateIssues(validInput({ x402QuoteTtlSeconds: "1.5" }))).toContain(
      "X402_QUOTE_TTL_SECONDS must be an integer number of seconds.",
    );
  });
});
