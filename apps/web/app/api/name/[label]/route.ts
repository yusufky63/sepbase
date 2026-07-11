import { apiContext, apiError, apiJson, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { isResolvableStatus, lifecycleLabel } from "@/lib/contract/lifecycle";
import { readName, serverPublicClient } from "@/lib/contract/server";
import { deploymentManifest, protocolDeployed } from "@/lib/deployment-manifest";
import { normalizeLabel } from "@/lib/name-normalization";

export { OPTIONS };

export async function GET(request: Request, context: { params: Promise<{ label: string }> }) {
  const { label: rawLabel } = await context.params;
  const normalized = normalizeLabel(rawLabel, apiContext().suffix);
  if (!normalized.valid) return apiError(400, "INVALID_INPUT", normalized.reason ?? "Invalid label.");
  if (rawLabel !== normalized.label) {
    return apiError(400, "INVALID_INPUT", "Machine API labels must be canonical lowercase labels without a suffix.", {
      normalizedSuggestion: normalized.label,
    });
  }
  if (!protocolDeployed) return deploymentPending();
  const durationRaw = new URL(request.url).searchParams.get("durationYears") ?? "1";
  if (!/^\d+$/.test(durationRaw) || !deploymentManifest.nameRules.allowedYears.includes(Number(durationRaw))) {
    return apiError(400, "INVALID_DURATION", "durationYears is not supported by this deployment.");
  }

  try {
    const blockNumber = await serverPublicClient.getBlockNumber();
    const durationYears = Number(durationRaw);
    const record = await readName(normalized.label, durationYears, blockNumber);
    if (!record) return deploymentPending();
    const effective = isResolvableStatus(record.status);
    return apiJson({
      data: {
        label: record.label,
        fullName: record.fullName,
        tokenId: record.tokenId.toString(),
        available: record.available,
        reserved: record.reserved,
        status: lifecycleLabel(record.status),
        statusCode: record.status,
        lifecycle: lifecycleLabel(record.status).toLowerCase(),
        tokenExists: record.owner !== null,
        registrationsPaused: record.registrationsPaused,
        solvent: record.solvent,
        canRegister: record.available && !record.registrationsPaused && record.solvent,
        nftOwner: record.owner,
        effectiveOwner: effective ? record.owner : null,
        resolvedAddress: effective ? record.resolvedAddress : null,
        expiresAt: record.expiresAt?.toString() ?? null,
        profile: effective ? record.profile : null,
        listing: record.listing ? {
          tokenId: record.listing.tokenId.toString(),
          seller: record.listing.seller,
          priceBaseUnits: record.listing.price.toString(),
          listedAt: record.listing.listedAt.toString(),
          feeBps: record.listing.feeBps,
        } : null,
        quote: {
          years: durationYears,
          amountBaseUnits: record.oneYearQuote.toString(),
        },
        blockNumber: blockNumber.toString(),
      },
      context: apiContext(),
    });
  } catch (error) {
    console.error("Name API read failed.", error);
    return rpcFailure();
  }
}
