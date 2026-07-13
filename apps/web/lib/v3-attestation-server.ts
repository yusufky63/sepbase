import "server-only";
import { isPrivateV3NetworkHost } from "@sepbase/sdk";
import type { V3AttestationIssuerConfig } from "./v3-attestation";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Server-only issuer authentication. This boundary intentionally has no signer or private-key option. */
export function readV3AttestationIssuerConfig(
  environment: Record<string, string | undefined> = process.env,
): V3AttestationIssuerConfig {
  const endpointValue = environment.V3_NORMALIZATION_ATTESTATION_ISSUER_URL?.trim();
  const token = environment.V3_NORMALIZATION_ATTESTATION_ISSUER_AUTH_TOKEN?.trim();
  if (!endpointValue || !token || token.length < 32 || token.length > 4_096 || /[\s\r\n]/.test(token)) {
    throw new Error("V3 normalization issuer configuration is unavailable.");
  }
  const endpoint = new URL(endpointValue);
  if (
    endpoint.protocol !== "https:"
    || endpoint.username
    || endpoint.password
    || endpoint.hash
    || endpoint.search
    || LOOPBACK_HOSTS.has(endpoint.hostname)
    || isPrivateV3NetworkHost(endpoint.hostname)
  ) throw new Error("V3 normalization issuer endpoint is invalid.");
  return { endpoint: endpoint.toString(), authorization: `Bearer ${token}` };
}
