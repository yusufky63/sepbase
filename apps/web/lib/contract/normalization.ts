import { zeroAddress } from "viem";
import type { NameListing } from "./types";

export function normalizeListing(listing: NameListing | readonly unknown[] | undefined): NameListing | null {
  if (!listing) return null;
  const normalized: {
    tokenId: unknown;
    seller: unknown;
    price: unknown;
    listedAt: unknown;
    feeBps: unknown;
  } = Array.isArray(listing)
    ? {
        tokenId: listing[0],
        seller: listing[1],
        price: listing[2],
        listedAt: listing[3],
        feeBps: listing[4],
      }
    : listing as NameListing;
  if (
    typeof normalized.tokenId !== "bigint"
    || typeof normalized.seller !== "string"
    || typeof normalized.price !== "bigint"
    || typeof normalized.listedAt !== "bigint"
    || typeof normalized.feeBps !== "number"
    || normalized.seller === zeroAddress
  ) return null;
  return normalized as NameListing;
}
