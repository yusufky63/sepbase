import { agentIntegrationManifest } from "@/lib/agent-manifest";
import { apiJson, OPTIONS } from "@/lib/api-response";

export { OPTIONS };

export function GET() {
  return apiJson(agentIntegrationManifest, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
