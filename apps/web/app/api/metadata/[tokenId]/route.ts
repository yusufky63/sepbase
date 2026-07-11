import { maxUint256 } from "viem";
import { projectConfig } from "@/config/project.config";
import { apiError, apiJson, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { isResolvableStatus, lifecycleLabel } from "@/lib/contract/lifecycle";
import { readTokenMetadata, serverPublicClient } from "@/lib/contract/server";
import { protocolDeployed } from "@/lib/deployment-manifest";

export { OPTIONS };

export async function GET(_request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const { tokenId: rawTokenId } = await context.params;
  if (!/^\d{1,78}$/.test(rawTokenId)) return apiError(400, "INVALID_TOKEN_ID", "Token ID must be a bounded unsigned integer.");
  if (!protocolDeployed) return deploymentPending();

  try {
    const tokenId = BigInt(rawTokenId);
    if (tokenId > maxUint256) return apiError(400, "INVALID_TOKEN_ID", "Token ID exceeds uint256.");
    const blockNumber = await serverPublicClient.getBlockNumber();
    const metadata = await readTokenMetadata(tokenId, blockNumber);
    if (metadata === undefined) return apiError(404, "TOKEN_NOT_FOUND", "No registered name exists for this token ID.");
    if (metadata === null) return deploymentPending();
    const base = projectConfig.siteUrl.replace(/\/$/, "");
    return apiJson({
      name: metadata.fullName,
      description: `${projectConfig.brand.name} name on ${projectConfig.chain.name}.`,
      image: `${base}${projectConfig.integration.imagePath}${rawTokenId}`,
      external_url: `${base}/name/${encodeURIComponent(metadata.fullName.slice(0, -(`.${projectConfig.brand.suffix}`).length))}`,
      attributes: [
        { trait_type: "Suffix", value: `.${projectConfig.brand.suffix}` },
        { trait_type: "Chain", value: projectConfig.chain.name },
        { trait_type: "Length", value: metadata.fullName.length - projectConfig.brand.suffix.length - 1 },
        { trait_type: "Status", value: lifecycleLabel(metadata.status) },
        { trait_type: "Expires", display_type: "date", value: Number(metadata.expiresAt) },
      ],
      properties: {
        tokenId: rawTokenId,
        owner: metadata.owner,
        resolvedAddress: isResolvableStatus(metadata.status) && metadata.resolvedAddress !== "0x0000000000000000000000000000000000000000"
          ? metadata.resolvedAddress
          : null,
        profile: metadata.profile,
        blockNumber: blockNumber.toString(),
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return rpcFailure();
  }
}
