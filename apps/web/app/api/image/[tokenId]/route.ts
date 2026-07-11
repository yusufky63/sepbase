import { maxUint256 } from "viem";
import { projectConfig } from "@/config/project.config";
import { apiError, deploymentPending, OPTIONS, rpcFailure } from "@/lib/api-response";
import { lifecycleLabel } from "@/lib/contract/lifecycle";
import { readTokenMetadata, serverPublicClient } from "@/lib/contract/server";
import { protocolDeployed } from "@/lib/deployment-manifest";

export { OPTIONS };

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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
    const ending = `.${projectConfig.brand.suffix}`;
    const label = metadata.fullName.slice(0, -ending.length);
    const fontSize = label.length > 24 ? 86 : label.length > 16 ? 108 : 140;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(metadata.fullName)}</title>
  <desc id="desc">${escapeXml(projectConfig.brand.name)} modular name object</desc>
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="32" height="630" fill="${projectConfig.brand.accent}"/>
  <path d="M72 88H1128M72 510H1128" stroke="#0a0b0d" stroke-width="2"/>
  <path d="M306 88V510M910 88V510" stroke="#b1b7c3" stroke-width="1"/>
  <rect x="72" y="112" width="198" height="72" fill="#0a0b0d"/>
  <text x="96" y="158" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeXml(projectConfig.brand.shortName)}</text>
  <text x="1128" y="145" text-anchor="end" fill="#0a0b0d" font-family="monospace" font-size="22">${escapeXml(projectConfig.chain.name)} / ${projectConfig.chain.id}</text>
  <text x="72" y="360" fill="#0a0b0d" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(label)}</text>
  <text x="72" y="438" fill="${projectConfig.brand.accent}" font-family="Arial, sans-serif" font-size="64" font-weight="700">${escapeXml(ending)}</text>
  <text x="72" y="558" fill="#0a0b0d" font-family="monospace" font-size="21">IDENTITY / ${lifecycleLabel(metadata.status)}</text>
  <text x="1128" y="558" text-anchor="end" fill="#0a0b0d" font-family="monospace" font-size="21">TOKEN / ${escapeXml(rawTokenId.slice(0, 18))}</text>
  <rect x="1092" y="594" width="36" height="36" fill="${projectConfig.brand.accent}"/>
</svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return rpcFailure();
  }
}
