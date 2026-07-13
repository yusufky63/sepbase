import { getAddress, isAddress } from "viem";
import {
  V3_OPTIONS,
  getServerV3Client,
  v3ApiContext,
  v3ApiError,
  v3ApiJson,
  v3Deployed,
  v3DeploymentPending,
} from "@/lib/v3-api";

export { V3_OPTIONS as OPTIONS };

function decimal(value: string | null, fallback: bigint, label: string) {
  const input = value ?? fallback.toString();
  if (!/^(0|[1-9][0-9]{0,77})$/.test(input)) throw new Error(`${label} must be a decimal uint.`);
  return BigInt(input);
}

export async function GET(request: Request) {
  if (!v3Deployed) return v3DeploymentPending();
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "listings";
  const limit = Number(url.searchParams.get("limit") ?? "24");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return v3ApiError(400, "INVALID_LIMIT", "limit must be an integer from 1 to 50.");
  }
  let cursor: bigint;
  let blockNumber: bigint | undefined;
  try {
    cursor = decimal(url.searchParams.get("cursor"), 0n, "cursor");
    blockNumber = url.searchParams.has("blockNumber")
      ? decimal(url.searchParams.get("blockNumber"), 0n, "blockNumber")
      : undefined;
  } catch (error) {
    return v3ApiError(400, "INVALID_CURSOR", error instanceof Error ? error.message : "Invalid cursor.");
  }
  try {
    const client = await getServerV3Client();
    if (view === "listings") {
      const page = await client.getListings(cursor, limit, blockNumber);
      return v3ApiJson({ data: page, context: v3ApiContext() });
    }
    if (view === "auctions") {
      const page = await client.getAuctions(cursor, limit, blockNumber);
      return v3ApiJson({ data: page, context: v3ApiContext() });
    }
    if (view !== "offers") return v3ApiError(400, "INVALID_VIEW", "view must be listings, offers, or auctions.");
    const includeTerminal = url.searchParams.get("includeTerminal") === "true";
    const scope = url.searchParams.get("scope") ?? "global";
    let page;
    if (scope === "global") {
      page = await client.getGlobalOffers(cursor, limit, includeTerminal, blockNumber);
    } else {
      const accountRaw = url.searchParams.get("account");
      if (!accountRaw || !isAddress(accountRaw)) {
        return v3ApiError(400, "INVALID_ACCOUNT", "buyer/owner offer scope requires a valid account.");
      }
      const account = getAddress(accountRaw);
      page = scope === "buyer"
        ? await client.getBuyerOffers(account, cursor, limit, includeTerminal, blockNumber)
        : scope === "owner"
          ? await client.getOwnerOffers(account, cursor, limit, includeTerminal, blockNumber)
          : null;
      if (!page) return v3ApiError(400, "INVALID_SCOPE", "Offer scope must be global, buyer, or owner.");
    }
    return v3ApiJson({ data: page, context: v3ApiContext() });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 market read failed.");
  }
}
