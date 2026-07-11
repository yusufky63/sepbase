import { apiJson, OPTIONS } from "@/lib/api-response";
import { deploymentManifest } from "@/lib/deployment-manifest";

export { OPTIONS };

export function GET() {
  return apiJson(deploymentManifest, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
