import type { Address } from "viem";

export type AdminRole = "owner" | "pending-owner" | "viewer" | null;

function sameAddress(left: string | undefined | null, right: string | undefined | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function resolveAdminRole(
  account: Address | undefined,
  owner: Address | undefined,
  pendingOwner: Address | undefined,
  viewerAddresses: readonly string[],
): AdminRole {
  if (!account) return null;
  if (sameAddress(account, owner)) return "owner";
  if (sameAddress(account, pendingOwner)) return "pending-owner";
  return viewerAddresses.some((viewer) => sameAddress(account, viewer)) ? "viewer" : null;
}
