import { describe, expect, it } from "vitest";
import { getAddress, keccak256, toBytes } from "viem";
import { X402RegistrationError } from "./errors";
import { createHmacQuoteAuthenticator } from "./quote-auth";
import {
  buildRegistrationQuote,
  parseAndValidateRegistrationQuote,
  parseRegistrationQuoteRequest,
  registrationQuoteId,
  type RegistrationQuoteScope,
} from "./quote";

const contract = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");
const referrer = getAddress("0x3333333333333333333333333333333333333333");
const token = getAddress("0x4444444444444444444444444444444444444444");
const authenticator = createHmacQuoteAuthenticator({
  keyId: "test-key",
  key: new Uint8Array(32).fill(7),
});

const scope: RegistrationQuoteScope = {
  chainId: 84_532,
  contract,
  contractVersion: "2.0.0",
  suffix: "sepbase",
  settlement: {
    kind: "erc20",
    tokenAddress: token,
    symbol: "USDC",
    decimals: 6,
  },
};

function live(overrides: Partial<Parameters<typeof buildRegistrationQuote>[0]["live"]> = {}) {
  return {
    tokenId: BigInt(keccak256(toBytes("agent"))),
    blockNumber: 44_011_800n,
    available: true,
    reserved: false,
    status: 0,
    registrationsPaused: false,
    solvent: true,
    amount: 2_000_000n,
    referralRewardBps: 1_000,
    ...overrides,
  };
}

describe("x402 registration quotes", () => {
  it("parses only canonical, unambiguous quote inputs", () => {
    const parsed = parseRegistrationQuoteRequest(
      `https://example.test/api/x402/registration/quote?label=agent&durationYears=2&recipient=${recipient}&referrer=${referrer}`,
      { suffix: "sepbase", allowedYears: [1, 2, 3, 4, 5], contract },
    );
    expect(parsed).toEqual({ label: "agent", durationYears: 2, recipient, referrer });

    expect(() => parseRegistrationQuoteRequest(
      `https://example.test/api/x402/registration/quote?label=Agent.sepbase&durationYears=2&recipient=${recipient}`,
      { suffix: "sepbase", allowedYears: [1, 2, 3, 4, 5], contract },
    )).toThrowError(X402RegistrationError);
  });

  it("binds amount, BPS, deployment scope and expiry into the quote ID", () => {
    const quote = buildRegistrationQuote({
      input: { label: "agent", durationYears: 2, recipient, referrer },
      live: live(),
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    expect(quote.terms.expectedAmountBaseUnits).toBe("2000000");
    expect(quote.terms.expectedReferralRewardBps).toBe(1_000);
    expect(quote.scope.network).toBe("eip155:84532");
    expect(quote.expiresAt).toBe("1800000060");
    expect(quote.quoteId).toMatch(/^sha256:[a-f0-9]{64}$/);

    expect(parseAndValidateRegistrationQuote(quote, {
      scope,
      nowSeconds: 1_800_000_030,
      maxTtlSeconds: 60,
      authenticator,
    })).toEqual(quote);

    expect(() => parseAndValidateRegistrationQuote(
      { ...quote, terms: { ...quote.terms, expectedAmountBaseUnits: "1" } },
      { scope, nowSeconds: 1_800_000_030, maxTtlSeconds: 60, authenticator },
    )).toThrowError(expect.objectContaining({ code: "QUOTE_INTEGRITY_FAILED" }));

    const { authentication, quoteId: originalQuoteId, ...unsigned } = quote;
    expect(originalQuoteId).toBe(quote.quoteId);
    const forgedUnsigned = {
      ...unsigned,
      terms: { ...unsigned.terms, expectedAmountBaseUnits: "1" },
    };
    const forged = {
      ...forgedUnsigned,
      quoteId: registrationQuoteId(forgedUnsigned),
      authentication,
    };
    expect(() => parseAndValidateRegistrationQuote(
      forged,
      { scope, nowSeconds: 1_800_000_030, maxTtlSeconds: 60, authenticator },
    )).toThrowError(expect.objectContaining({ code: "QUOTE_AUTHENTICATION_FAILED" }));
  });

  it("rejects reserved, registered, paused, insolvent and expired states", () => {
    const build = (overrides: Partial<ReturnType<typeof live>>) => buildRegistrationQuote({
      input: { label: "agent", durationYears: 1, recipient, referrer: null },
      live: live(overrides),
      scope,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 60,
      authenticator,
    });
    expect(() => build({ reserved: true })).toThrowError(expect.objectContaining({ code: "NAME_RESERVED" }));
    expect(() => build({ available: false, status: 1 })).toThrowError(expect.objectContaining({ code: "NAME_NOT_AVAILABLE" }));
    expect(() => build({ registrationsPaused: true })).toThrowError(expect.objectContaining({ code: "REGISTRATIONS_PAUSED" }));
    expect(() => build({ solvent: false })).toThrowError(expect.objectContaining({ code: "PROTOCOL_INSOLVENT" }));

    const quote = build({});
    expect(() => parseAndValidateRegistrationQuote(quote, {
      scope,
      nowSeconds: 1_800_000_060,
      maxTtlSeconds: 60,
      authenticator,
    })).toThrowError(expect.objectContaining({ code: "QUOTE_EXPIRED" }));
  });
});
