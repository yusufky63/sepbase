import { describe, expect, it } from "vitest";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";
import { getAddress, keccak256, toBytes } from "viem";
import {
  buildOfficialX402RouteConfig,
  createOfficialX402V2Adapter,
  OfficialX402V2Adapter,
} from "./official-adapter";
import { buildRegistrationQuote, type RegistrationQuoteScope } from "./quote";
import { createHmacQuoteAuthenticator } from "./quote-auth";
import { legacyV2QuotePaymentIntent } from "./deployment-profile";

const contract = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const keeper = getAddress("0x4444444444444444444444444444444444444444");
const authenticator = createHmacQuoteAuthenticator({
  keyId: "test-key",
  key: new Uint8Array(32).fill(8),
});

const scope: RegistrationQuoteScope = {
  chainId: 84_532,
  contract,
  contractVersion: "2.0.0",
  suffix: "sepbase",
  settlement: { kind: "erc20", tokenAddress: token, symbol: "USDC", decimals: 6 },
};

describe("official x402 adapter boundary", () => {
  it("produces the @x402/core RouteConfig shape with required idempotency", () => {
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: {
        tokenId: BigInt(keccak256(toBytes("agent"))),
        blockNumber: 1n,
        available: true,
        reserved: false,
        status: 0,
        registrationsPaused: false,
        solvent: true,
        amount: 1_000_000n,
        referralRewardBps: 1_000,
      },
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    const config = buildOfficialX402RouteConfig({
      intent: legacyV2QuotePaymentIntent(quote, keeper),
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
    });
    expect(config.accepts).toHaveLength(1);
    expect(config.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "eip155:84532",
      payTo: keeper,
      price: { asset: token, amount: "1000000" },
      maxTimeoutSeconds: 60,
    });
    expect(config.extensions).toHaveProperty("payment-identifier");
    expect(config.extensions["payment-identifier"]).toMatchObject({ info: { required: true } });
  });

  it("uses the official V2 server for CAIP-2 challenge, verify and settle", async () => {
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: {
        tokenId: BigInt(keccak256(toBytes("agent"))),
        blockNumber: 1n,
        available: true,
        reserved: false,
        status: 0,
        registrationsPaused: false,
        solvent: true,
        amount: 1_000_000n,
        referralRewardBps: 1_000,
      },
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    const facilitator: FacilitatorClient = {
      getSupported: async () => ({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
        extensions: [],
        signers: {},
      }),
      verify: async () => ({ isValid: true, payer: recipient }),
      settle: async () => ({
        success: true,
        payer: recipient,
        transaction: `0x${"ab".repeat(32)}`,
        network: "eip155:84532",
        amount: "1000000",
      }),
    };
    const adapter = new OfficialX402V2Adapter({
      facilitator,
      network: "eip155:84532",
    });
    const challenge = await adapter.createChallenge(buildOfficialX402RouteConfig({
      intent: legacyV2QuotePaymentIntent(quote, keeper),
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
    }));
    expect(challenge.paymentRequiredHeader).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(challenge.requirement).toMatchObject({
      scheme: "exact",
      network: "eip155:84532",
      asset: token,
      amount: "1000000",
      payTo: keeper,
    });

    const extensions = structuredClone(challenge.paymentRequired.extensions ?? {});
    appendPaymentIdentifierToExtensions(extensions, "pay_1234567890abcdef");
    const decoded = adapter.decodePayment(encodePaymentSignatureHeader({
      x402Version: 2,
      resource: challenge.paymentRequired.resource,
      accepted: challenge.requirement,
      payload: { signature: "test-only" },
      extensions,
    }));
    expect(adapter.matchPayment(decoded, challenge).paymentIdentifier)
      .toBe("pay_1234567890abcdef");
    const { resource: _resource, ...withoutResource } = decoded;
    void _resource;
    expect(() => adapter.matchPayment(withoutResource, challenge))
      .toThrowError(expect.objectContaining({ code: "PAYMENT_RESOURCE_MISMATCH" }));
    expect(() => adapter.matchPayment({
      ...decoded,
      resource: { ...challenge.paymentRequired.resource, description: "tampered" },
    }, challenge)).toThrowError(expect.objectContaining({ code: "PAYMENT_RESOURCE_MISMATCH" }));
    await expect(adapter.verify(decoded, challenge)).resolves.toMatchObject({ isValid: true });
    await expect(adapter.settle(decoded, challenge)).resolves.toMatchObject({
      success: true,
      network: "eip155:84532",
    });
  });

  it("requires the exact canonical registration resource", () => {
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: {
        tokenId: BigInt(keccak256(toBytes("agent"))),
        blockNumber: 1n,
        available: true,
        reserved: false,
        status: 0,
        registrationsPaused: false,
        solvent: true,
        amount: 1_000_000n,
        referralRewardBps: 1_000,
      },
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    const intent = legacyV2QuotePaymentIntent(quote, keeper);
    expect(() => buildOfficialX402RouteConfig({
      intent: { ...intent, resourcePath: "/api/x402/registration?redirect=1" },
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
    })).toThrowError(expect.objectContaining({ code: "INVALID_PAYMENT_RESOURCE" }));
  });

  it("uses abortable no-redirect facilitator requests", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
        extensions: [],
        signers: {},
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const adapter = createOfficialX402V2Adapter({
      facilitatorUrl: "https://facilitator.example/v2",
      network: "eip155:84532",
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: {
        tokenId: BigInt(keccak256(toBytes("agent"))),
        blockNumber: 1n,
        available: true,
        reserved: false,
        status: 0,
        registrationsPaused: false,
        solvent: true,
        amount: 1_000_000n,
        referralRewardBps: 1_000,
      },
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    await adapter.createChallenge(buildOfficialX402RouteConfig({
      intent: legacyV2QuotePaymentIntent(quote, keeper),
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
    }));
    expect(calls[0]?.redirect).toBe("error");
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("actively aborts a facilitator request at its deadline", async () => {
    let aborted = false;
    const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    });
    const adapter = createOfficialX402V2Adapter({
      facilitatorUrl: "https://facilitator.example/v2",
      network: "eip155:84532",
      timeoutMs: 5,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: {
        tokenId: BigInt(keccak256(toBytes("agent"))),
        blockNumber: 1n,
        available: true,
        reserved: false,
        status: 0,
        registrationsPaused: false,
        solvent: true,
        amount: 1_000_000n,
        referralRewardBps: 1_000,
      },
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    await expect(adapter.createChallenge(buildOfficialX402RouteConfig({
      intent: legacyV2QuotePaymentIntent(quote, keeper),
      siteOrigin: "https://names.example",
      nowSeconds: 1_800_000_030,
    }))).rejects.toMatchObject({ code: "FACILITATOR_UNAVAILABLE" });
    expect(aborted).toBe(true);
  });
});
