import { createHash } from "node:crypto";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  paymentIdentifierResourceServerExtension,
  validatePaymentIdentifierRequirement,
} from "@x402/extensions/payment-identifier";
import { getAddress, type Address } from "viem";
import { z } from "zod";
import {
  X402_EXACT_SCHEME,
  X402_PROTOCOL_VERSION,
  X402_REGISTRATION_PATH,
} from "./constants";
import { X402RegistrationError } from "./errors";
import type { X402RegistrationPaymentIntent } from "./types";

export type OfficialX402RouteConfig = {
  accepts: Array<{
    scheme: "exact";
    payTo: Address;
    price: { asset: Address; amount: string };
    network: `eip155:${number}`;
    maxTimeoutSeconds: number;
  }>;
  resource: string;
  description: string;
  mimeType: "application/json";
  extensions: Record<string, unknown>;
};

export type OfficialX402Challenge = {
  paymentRequired: PaymentRequired;
  requirement: PaymentRequirements;
  paymentRequiredHeader: string;
  declaredExtensions: Record<string, unknown>;
};

export interface OfficialX402RegistrationAdapter {
  readonly protocolVersion: 2;
  readonly implementation: "@x402/core";
  createChallenge(routeConfig: OfficialX402RouteConfig): Promise<OfficialX402Challenge>;
  decodePayment(paymentSignatureHeader: string): PaymentPayload;
  matchPayment(
    payment: PaymentPayload,
    challenge: OfficialX402Challenge,
  ): { requirement: PaymentRequirements; paymentIdentifier: string };
  verify(
    payment: PaymentPayload,
    challenge: OfficialX402Challenge,
  ): Promise<VerifyResponse>;
  settle(
    payment: PaymentPayload,
    challenge: OfficialX402Challenge,
  ): Promise<SettleResponse>;
  encodeSettlement(settlement: SettleResponse): string;
}

export function buildOfficialX402RouteConfig(options: {
  intent: X402RegistrationPaymentIntent;
  siteOrigin: string;
  nowSeconds: number;
}): OfficialX402RouteConfig {
  const remainingSeconds = Number(options.intent.expiresAt) - options.nowSeconds;
  if (!Number.isSafeInteger(remainingSeconds) || remainingSeconds <= 0) {
    throw new X402RegistrationError(409, "QUOTE_EXPIRED", "The registration quote has expired.");
  }
  if (
    options.intent.resourcePath !== X402_REGISTRATION_PATH
    || !Number.isSafeInteger(options.intent.paymentTimeoutSeconds)
    || options.intent.paymentTimeoutSeconds <= 0
  ) {
    throw new X402RegistrationError(503, "INVALID_PAYMENT_RESOURCE", "The signed quote does not use the canonical registration resource.");
  }
  const origin = new URL(options.siteOrigin);
  const loopback = origin.hostname === "localhost"
    || origin.hostname === "127.0.0.1"
    || origin.hostname === "[::1]";
  if (
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new X402RegistrationError(503, "INVALID_SITE_ORIGIN", "The configured site origin is invalid.");
  }
  return {
    accepts: [{
      scheme: X402_EXACT_SCHEME,
      payTo: getAddress(options.intent.payTo),
      price: {
        asset: getAddress(options.intent.asset),
        amount: options.intent.amountBaseUnits,
      },
      network: options.intent.network,
      maxTimeoutSeconds: options.intent.paymentTimeoutSeconds,
    }],
    resource: new URL(options.intent.resourcePath, origin).toString(),
    description: options.intent.description,
    mimeType: "application/json",
    extensions: {
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
    },
  };
}

export function canonicalX402Json(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Non-finite canonical JSON number");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalX402Json).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalX402Json(object[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Unsupported requirement metadata");
}

function sameRequirement(left: PaymentRequirements, right: PaymentRequirements) {
  return left.scheme === right.scheme
    && left.network === right.network
    && left.asset.toLowerCase() === right.asset.toLowerCase()
    && left.amount === right.amount
    && left.payTo.toLowerCase() === right.payTo.toLowerCase()
    && left.maxTimeoutSeconds === right.maxTimeoutSeconds
    && canonicalX402Json(left.extra) === canonicalX402Json(right.extra);
}

export function officialX402ChallengeHash(challenge: OfficialX402Challenge) {
  return `sha256:${createHash("sha256").update(canonicalX402Json([
    challenge.paymentRequired,
    challenge.requirement,
    challenge.paymentRequiredHeader,
    challenge.declaredExtensions,
  ])).digest("hex")}` as const;
}

export function assertOfficialX402ChallengeMatchesConfig(
  challenge: OfficialX402Challenge,
  config: OfficialX402RouteConfig,
) {
  const option = config.accepts[0];
  const expectedResource = {
    url: config.resource,
    description: config.description,
    mimeType: config.mimeType,
  };
  if (
    !option
    || config.accepts.length !== 1
    || challenge.paymentRequired.x402Version !== X402_PROTOCOL_VERSION
    || challenge.paymentRequired.accepts.length !== 1
    || !sameRequirement(challenge.paymentRequired.accepts[0]!, challenge.requirement)
    || challenge.requirement.scheme !== option.scheme
    || challenge.requirement.network !== option.network
    || challenge.requirement.asset.toLowerCase() !== option.price.asset.toLowerCase()
    || challenge.requirement.amount !== option.price.amount
    || challenge.requirement.payTo.toLowerCase() !== option.payTo.toLowerCase()
    || challenge.requirement.maxTimeoutSeconds !== option.maxTimeoutSeconds
    || canonicalX402Json(challenge.paymentRequired.resource) !== canonicalX402Json(expectedResource)
    || canonicalX402Json(challenge.paymentRequired.extensions ?? {})
      !== canonicalX402Json(challenge.declaredExtensions)
    || challenge.paymentRequiredHeader !== encodePaymentRequiredHeader(challenge.paymentRequired)
  ) {
    throw new X402RegistrationError(503, "PERSISTED_CHALLENGE_MISMATCH", "The persisted x402 challenge does not match the signed quote.");
  }
}

export class OfficialX402V2Adapter implements OfficialX402RegistrationAdapter {
  readonly protocolVersion = X402_PROTOCOL_VERSION;
  readonly implementation = "@x402/core" as const;
  readonly #server: x402ResourceServer;
  readonly #network: Network;
  #initialization: Promise<void> | null = null;

  constructor(options: { facilitator: FacilitatorClient; network: `eip155:${number}` }) {
    this.#network = options.network;
    this.#server = new x402ResourceServer(options.facilitator)
      .register(options.network, new ExactEvmScheme())
      .registerExtension(paymentIdentifierResourceServerExtension);
  }

  async #initialize() {
    this.#initialization ??= this.#server.initialize().catch((error) => {
      this.#initialization = null;
      throw error;
    });
    try {
      await this.#initialization;
    } catch {
      throw new X402RegistrationError(
        503,
        "FACILITATOR_UNAVAILABLE",
        "The payment facilitator is unavailable.",
      );
    }
    if (!this.#server.getSupportedKind(X402_PROTOCOL_VERSION, this.#network, X402_EXACT_SCHEME)) {
      throw new X402RegistrationError(
        503,
        "FACILITATOR_UNSUPPORTED",
        "The facilitator does not support the required x402 V2 network and scheme.",
      );
    }
  }

  async createChallenge(routeConfig: OfficialX402RouteConfig): Promise<OfficialX402Challenge> {
    await this.#initialize();
    const option = routeConfig.accepts[0];
    if (!option || routeConfig.accepts.length !== 1 || option.network !== this.#network) {
      throw new X402RegistrationError(503, "INVALID_PAYMENT_REQUIREMENTS", "The payment requirements are invalid.");
    }
    const requirements = await this.#server.buildPaymentRequirements({
      scheme: option.scheme,
      payTo: option.payTo,
      price: option.price,
      network: option.network,
      maxTimeoutSeconds: option.maxTimeoutSeconds,
    });
    const requirement = requirements[0];
    if (!requirement || requirements.length !== 1) {
      throw new X402RegistrationError(503, "INVALID_PAYMENT_REQUIREMENTS", "The facilitator returned invalid requirements.");
    }
    const paymentRequired = await this.#server.createPaymentRequiredResponse(
      requirements,
      {
        url: routeConfig.resource,
        description: routeConfig.description,
        mimeType: routeConfig.mimeType,
      },
      undefined,
      routeConfig.extensions,
    );
    return {
      paymentRequired,
      requirement,
      paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
      declaredExtensions: routeConfig.extensions,
    };
  }

  decodePayment(paymentSignatureHeader: string) {
    try {
      return decodePaymentSignatureHeader(paymentSignatureHeader);
    } catch {
      throw new X402RegistrationError(400, "INVALID_PAYMENT_SIGNATURE", "PAYMENT-SIGNATURE is invalid.");
    }
  }

  matchPayment(payment: PaymentPayload, challenge: OfficialX402Challenge) {
    if (payment.x402Version !== X402_PROTOCOL_VERSION) {
      throw new X402RegistrationError(409, "PAYMENT_SCOPE_MISMATCH", "The payment uses an unsupported x402 version.");
    }
    const extensionValidation = this.#server.validateExtensions(challenge.paymentRequired, payment);
    if (!extensionValidation.valid) {
      throw new X402RegistrationError(400, "INVALID_PAYMENT_EXTENSIONS", "The payment extensions are invalid.");
    }
    const identifierRequirement = validatePaymentIdentifierRequirement(payment, true);
    const identifier = extractAndValidatePaymentIdentifier(payment);
    if (!identifierRequirement.valid || !identifier.validation.valid || !identifier.id) {
      throw new X402RegistrationError(400, "INVALID_PAYMENT_IDENTIFIER", "A valid payment identifier is required.");
    }
    const matched = this.#server.findMatchingRequirements(
      challenge.paymentRequired.accepts,
      payment,
    );
    if (!matched || !sameRequirement(matched, challenge.requirement)
      || !sameRequirement(payment.accepted, challenge.requirement)) {
      throw new X402RegistrationError(409, "PAYMENT_SCOPE_MISMATCH", "The payment does not match the registration quote.");
    }
    if (
      !payment.resource
      || canonicalX402Json(payment.resource)
        !== canonicalX402Json(challenge.paymentRequired.resource)
    ) {
      throw new X402RegistrationError(409, "PAYMENT_RESOURCE_MISMATCH", "The payment belongs to another resource.");
    }
    return { requirement: matched, paymentIdentifier: identifier.id };
  }

  async verify(payment: PaymentPayload, challenge: OfficialX402Challenge) {
    this.matchPayment(payment, challenge);
    let result: VerifyResponse;
    try {
      result = await this.#server.verifyPayment(
        payment,
        challenge.requirement,
        challenge.declaredExtensions,
      );
    } catch {
      throw new X402RegistrationError(502, "PAYMENT_VERIFICATION_UNAVAILABLE", "Payment verification is unavailable.");
    }
    if (!result.isValid) {
      throw new X402RegistrationError(402, "PAYMENT_VERIFICATION_FAILED", "The facilitator rejected the payment.");
    }
    return result;
  }

  async settle(payment: PaymentPayload, challenge: OfficialX402Challenge) {
    try {
      return await this.#server.settlePayment(
        payment,
        challenge.requirement,
        challenge.declaredExtensions,
      );
    } catch {
      throw new X402RegistrationError(502, "PAYMENT_SETTLEMENT_UNAVAILABLE", "Payment settlement is unavailable.");
    }
  }

  encodeSettlement(settlement: SettleResponse) {
    return encodePaymentResponseHeader(settlement);
  }
}

export function createOfficialX402V2Adapter(options: {
  facilitatorUrl: string;
  facilitatorAuthToken?: string;
  network: `eip155:${number}`;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}) {
  const facilitator = createStrictFacilitatorClient(options);
  return new OfficialX402V2Adapter({ facilitator, network: options.network });
}

const verifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  invalidMessage: z.string().optional(),
  payer: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
const settleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  errorMessage: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string(),
  network: z.string(),
  amount: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
const supportedResponseSchema = z.object({
  kinds: z.array(z.object({
    x402Version: z.number(),
    scheme: z.string(),
    network: z.string(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })),
  extensions: z.array(z.string()).default([]),
  signers: z.record(z.string(), z.array(z.string())).default({}),
});

function createStrictFacilitatorClient(options: {
  facilitatorUrl: string;
  facilitatorAuthToken?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): FacilitatorClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = new URL(options.facilitatorUrl);
  const loopback = base.hostname === "localhost"
    || base.hostname === "127.0.0.1"
    || base.hostname === "[::1]";
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback))
    || base.username
    || base.password
    || base.search
    || base.hash
  ) {
    throw new X402RegistrationError(503, "FACILITATOR_NOT_CONFIGURED", "The facilitator endpoint is invalid.");
  }
  const baseUrl = base.toString().replace(/\/+$/, "");
  const token = options.facilitatorAuthToken?.trim();

  async function request<T>(path: "/supported" | "/verify" | "/settle", init: RequestInit, schema: z.ZodType<T>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("facilitator operation failed");
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error("facilitator response too large");
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("facilitator response invalid");
      return parsed.data;
    } catch {
      throw new Error("facilitator operation unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  const requestBody = (paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) => JSON.stringify({
    x402Version: paymentPayload.x402Version,
    paymentPayload,
    paymentRequirements,
  });
  return {
    getSupported: () => request("/supported", { method: "GET" }, supportedResponseSchema) as Promise<SupportedResponse>,
    verify: (paymentPayload, paymentRequirements) => request(
      "/verify",
      { method: "POST", body: requestBody(paymentPayload, paymentRequirements) },
      verifyResponseSchema,
    ) as Promise<VerifyResponse>,
    settle: (paymentPayload, paymentRequirements) => request(
      "/settle",
      { method: "POST", body: requestBody(paymentPayload, paymentRequirements) },
      settleResponseSchema,
    ) as Promise<SettleResponse>,
  };
}
