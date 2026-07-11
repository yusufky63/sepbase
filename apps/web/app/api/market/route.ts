import { projectConfig } from "@/config/project.config";
import { apiContext, apiError, apiJson, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { readMarket, serverPublicClient } from "@/lib/contract/server";
import { protocolDeployed } from "@/lib/deployment-manifest";

export { OPTIONS };

function nonnegativeInteger(value: string | null, fallback: number) {
  if (value === null) return fallback;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export async function GET(request: Request) {
  if (!protocolDeployed) return deploymentPending();
  const url = new URL(request.url);
  const cursorValue = url.searchParams.get("cursor") ?? url.searchParams.get("offset");
  const offset = nonnegativeInteger(cursorValue, 0);
  const limit = nonnegativeInteger(url.searchParams.get("limit"), projectConfig.marketplace.listingsPerPage);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return apiError(400, "INVALID_CURSOR", "Cursor must be a non-negative base-10 integer.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return apiError(400, "INVALID_LIMIT", "Limit must be an integer from 1 to 50.");
  }

  try {
    const blockNumber = await serverPublicClient.getBlockNumber();
    let rawCursor = offset;
    let scanned = 0;
    let total = 0n;
    let marketplacePaused = false;
    let solvent = false;
    const listings: NonNullable<Awaited<ReturnType<typeof readMarket>>>["listings"] = [];
    for (let page = 0; page < 4 && scanned < 200 && listings.length < limit; page += 1) {
      const pageLimit = Math.min(50, 200 - scanned, limit - listings.length);
      const market = await readMarket(BigInt(rawCursor), BigInt(pageLimit), blockNumber);
      if (!market) return deploymentPending();
      total = market.total;
      marketplacePaused = market.marketplacePaused;
      solvent = market.solvent;
      listings.push(...market.listings);
      scanned += market.rawCount;
      rawCursor += market.rawCount;
      if (market.rawCount < pageLimit || BigInt(rawCursor) >= total) break;
    }
    const hasMore = BigInt(rawCursor) < total;
    return apiJson({
      items: listings.map((listing) => ({
        tokenId: listing.tokenId.toString(),
        label: listing.fullName.slice(0, -(`.${apiContext().suffix}`).length),
        fullName: listing.fullName,
        seller: listing.seller,
        priceBaseUnits: listing.price.toString(),
        feeBps: listing.feeBps,
        listedAt: listing.listedAt.toString(),
        expiresAt: listing.expiresAt.toString(),
        purchasable: !marketplacePaused && solvent,
      })),
      marketplacePaused,
      solvent,
      blockNumber: blockNumber.toString(),
      nextCursor: hasMore ? String(rawCursor) : null,
      hasMore,
      scanned,
      context: apiContext(),
    });
  } catch {
    return rpcFailure();
  }
}
