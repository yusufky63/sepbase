import { getAddress, isAddress } from "viem";

export function shortenAddress(value: string, size = 4): string {
  if (!isAddress(value)) return value;
  const address = getAddress(value);
  return `${address.slice(0, size + 2)}...${address.slice(-size)}`;
}

export function formatDate(timestamp: bigint | number): string {
  const value = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value * 1000));
}
