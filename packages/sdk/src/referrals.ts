import type { Address } from "viem";

export function createReferralUrl(baseUrl: string | URL, referrer: Address): URL {
  return new URL(`/r/${referrer}`, baseUrl);
}
