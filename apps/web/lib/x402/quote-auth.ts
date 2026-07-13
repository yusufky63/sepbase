import { createHmac, timingSafeEqual } from "node:crypto";
import { X402RegistrationError } from "./errors";
import type { RegistrationQuote } from "./types";

type Environment = Record<string, string | undefined>;

export type QuoteAuthentication = RegistrationQuote["authentication"];

export interface RegistrationQuoteAuthenticator {
  readonly algorithm: "hmac-sha256";
  readonly keyId: string;
  sign(payload: string): QuoteAuthentication;
  verify(payload: string, authentication: QuoteAuthentication): boolean;
}

const keyIdPattern = /^[A-Za-z0-9._-]{1,64}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]{43,128}$/;

function decodeKey(encoded: string) {
  if (!base64UrlPattern.test(encoded)) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url");
    return decoded.byteLength >= 32 && decoded.byteLength <= 64 ? decoded : null;
  } catch {
    return null;
  }
}

export function quoteAuthenticationConfigured(environment: Environment = process.env) {
  const keyId = environment.X402_QUOTE_HMAC_KEY_ID?.trim() ?? "";
  const encodedKey = environment.X402_QUOTE_HMAC_KEY?.trim() ?? "";
  return keyIdPattern.test(keyId) && decodeKey(encodedKey) !== null;
}

export function createHmacQuoteAuthenticator(options: {
  keyId: string;
  key: Uint8Array;
}): RegistrationQuoteAuthenticator {
  if (!keyIdPattern.test(options.keyId) || options.key.byteLength < 32 || options.key.byteLength > 64) {
    throw new X402RegistrationError(
      503,
      "QUOTE_AUTHENTICATION_NOT_CONFIGURED",
      "The server quote authenticator is not configured.",
    );
  }
  const key = Buffer.from(options.key);
  const digest = (payload: string) => createHmac("sha256", key).update(payload).digest();

  return {
    algorithm: "hmac-sha256",
    keyId: options.keyId,
    sign(payload) {
      return {
        algorithm: "hmac-sha256",
        keyId: options.keyId,
        signature: digest(payload).toString("base64url"),
      };
    },
    verify(payload, authentication) {
      if (
        authentication.algorithm !== "hmac-sha256"
        || authentication.keyId !== options.keyId
        || !/^[A-Za-z0-9_-]{43}$/.test(authentication.signature)
      ) return false;
      const supplied = Buffer.from(authentication.signature, "base64url");
      const expected = digest(payload);
      return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
    },
  };
}

export function quoteAuthenticatorFromEnvironment(
  environment: Environment = process.env,
): RegistrationQuoteAuthenticator {
  const keyId = environment.X402_QUOTE_HMAC_KEY_ID?.trim() ?? "";
  const key = decodeKey(environment.X402_QUOTE_HMAC_KEY?.trim() ?? "");
  if (!keyIdPattern.test(keyId) || !key) {
    throw new X402RegistrationError(
      503,
      "QUOTE_AUTHENTICATION_NOT_CONFIGURED",
      "The server quote authenticator is not configured.",
    );
  }
  return createHmacQuoteAuthenticator({ keyId, key });
}
