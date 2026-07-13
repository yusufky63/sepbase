import { describe, expect, it, vi } from "vitest";
import { SEPBASE_NORMALIZATION, hashV3NormalizationAttestation } from "@sepbase/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  V3_ATTESTATION_MAX_REQUEST_BYTES,
  handleV3NormalizationAttestation,
  type V3AttestationManifest,
} from "./v3-attestation";

const controller = "0x1000000000000000000000000000000000000001" as Address;
const recipient = "0x2000000000000000000000000000000000000002" as Address;
const account = privateKeyToAccount(generatePrivateKey());
const authSecret = `issuer-${"secret".repeat(8)}`;
const now = 1_000n;

function manifest(releaseStatus: V3AttestationManifest["releaseStatus"] = "candidate"): V3AttestationManifest {
  return {
    schemaVersion: 4,
    suiteVersion: "3.0.0",
    releaseStatus,
    suiteReleaseId: `sha256:${"a".repeat(64)}`,
    chainId: 84_532,
    suffix: "sepbase",
    nameRules: { minCodepoints: 1, maxCodepoints: 32, maxUtf8Bytes: 96 },
    normalization: {
      profileId: SEPBASE_NORMALIZATION.profileIdentifier,
      profileHash: SEPBASE_NORMALIZATION.profileHash,
      attestor: releaseStatus === "draft" ? null : account.address,
      maxAttestationValiditySeconds: "900",
    },
    contracts: { controller: { address: releaseStatus === "draft" ? null : controller } },
    wiring: { suiteConfigured: releaseStatus !== "draft" },
    commitment: { minAgeSeconds: "60" },
  };
}

function publicPayload(overrides: Record<string, unknown> = {}) {
  const current = manifest();
  return {
    schemaVersion: 1,
    suiteReleaseId: current.suiteReleaseId,
    chainId: current.chainId,
    controller,
    normalizationProfileId: current.normalization.profileId,
    normalizationProfileHash: current.normalization.profileHash,
    attestor: account.address,
    recipient,
    rawInput: "alice",
    ...overrides,
  };
}

function publicRequest(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("https://names.example/api/v3/normalization-attestation", {
    method: "POST",
    headers: {
      Origin: "https://names.example",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function issuerFetcher(signer = account): typeof fetch {
  return async (_input, init) => {
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${authSecret}`);
    const scope = JSON.parse(String(init?.body)) as {
      schemaVersion: 1;
      suiteReleaseId: `sha256:${string}`;
      chainId: number;
      controller: Address;
      normalizationProfileId: string;
      normalizationProfileHash: Hex;
      label: string;
      labelHash: Hex;
      recipient: Address;
      attestor: Address;
      requestedAt: string;
      maxValidUntil: string;
    };
    const validUntil = now + 600n;
    const signature = await signer.signTypedData({
      domain: {
        name: "ChainNameControllerV3",
        version: "3",
        chainId: scope.chainId,
        verifyingContract: scope.controller,
      },
      types: {
        NormalizationAttestation: [
          { name: "chainId", type: "uint256" },
          { name: "controller", type: "address" },
          { name: "normalizationProfileHash", type: "bytes32" },
          { name: "labelHash", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "validUntil", type: "uint64" },
        ],
      },
      primaryType: "NormalizationAttestation",
      message: {
        chainId: BigInt(scope.chainId),
        controller: scope.controller,
        normalizationProfileHash: scope.normalizationProfileHash,
        labelHash: scope.labelHash,
        recipient: scope.recipient,
        validUntil,
      },
    });
    return Response.json({
      schemaVersion: scope.schemaVersion,
      suiteReleaseId: scope.suiteReleaseId,
      chainId: scope.chainId,
      controller: scope.controller,
      normalizationProfileId: scope.normalizationProfileId,
      normalizationProfileHash: scope.normalizationProfileHash,
      label: scope.label,
      labelHash: scope.labelHash,
      recipient: scope.recipient,
      attestor: scope.attestor,
      validUntil: validUntil.toString(),
      signature,
    }, {
      headers: { "Content-Type": "application/json" },
    });
  };
}

function options(overrides: Partial<Parameters<typeof handleV3NormalizationAttestation>[1]> = {}) {
  return {
    manifest: manifest(),
    allowedOrigin: "https://names.example",
    readIssuerConfig: () => ({
      endpoint: "https://issuer.example/attest",
      authorization: `Bearer ${authSecret}`,
    }),
    fetcher: issuerFetcher(),
    now: () => now,
    ...overrides,
  };
}

describe("V3 normalization attestation proxy", () => {
  it("fails a draft before body, credential or issuer access", async () => {
    const readIssuerConfig = vi.fn(() => { throw new Error("must not run"); });
    const fetcher = vi.fn();
    const response = await handleV3NormalizationAttestation(publicRequest(publicPayload()), options({
      manifest: manifest("draft"),
      readIssuerConfig,
      fetcher: fetcher as unknown as typeof fetch,
    }));
    expect(response.status).toBe(503);
    expect(readIssuerConfig).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation when raw input differs from the canonical label", async () => {
    const readIssuerConfig = vi.fn();
    const response = await handleV3NormalizationAttestation(
      publicRequest(publicPayload({ rawInput: "Alice.sepbase" })),
      options({ readIssuerConfig }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CANONICAL_CONFIRMATION_REQUIRED", normalizedSuggestion: "alice" },
    });
    expect(readIssuerConfig).not.toHaveBeenCalled();
  });

  it("rejects wrong release scope and oversized bodies before issuer I/O", async () => {
    const readIssuerConfig = vi.fn();
    const wrongScope = await handleV3NormalizationAttestation(
      publicRequest(publicPayload({ controller: recipient })),
      options({ readIssuerConfig }),
    );
    expect(wrongScope.status).toBe(409);
    expect(readIssuerConfig).not.toHaveBeenCalled();

    const oversized = await handleV3NormalizationAttestation(
      publicRequest(publicPayload(), { "Content-Length": String(V3_ATTESTATION_MAX_REQUEST_BYTES + 1) }),
      options({ readIssuerConfig }),
    );
    expect(oversized.status).toBe(413);
    expect(readIssuerConfig).not.toHaveBeenCalled();
  });

  it("recovers the exact attestor and returns a locally recomputed controller hash", async () => {
    const response = await handleV3NormalizationAttestation(publicRequest(publicPayload()), options());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const bodyText = await response.text();
    expect(bodyText).not.toContain(authSecret);
    expect(bodyText).not.toContain("issuer.example");
    const body = JSON.parse(bodyText) as { data: { validUntil: string; signature: Hex; controllerAttestationHash: Hex } };
    expect(body.data.controllerAttestationHash).toBe(hashV3NormalizationAttestation({
      validUntil: BigInt(body.data.validUntil),
      signature: body.data.signature,
    }));
  });

  it("fails closed for forged signatures without echoing issuer data", async () => {
    const forged = privateKeyToAccount(generatePrivateKey());
    const response = await handleV3NormalizationAttestation(
      publicRequest(publicPayload()),
      options({ fetcher: issuerFetcher(forged) }),
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("ATTESTATION_VERIFICATION_FAILED");
    expect(body).not.toContain(authSecret);
    expect(body).not.toContain("0x");
  });

  it("requires the exact configured browser Origin", async () => {
    const request = publicRequest(publicPayload(), { Origin: "https://evil.example" });
    const response = await handleV3NormalizationAttestation(request, options());
    expect(response.status).toBe(403);
  });
});
