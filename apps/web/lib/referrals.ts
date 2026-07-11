import { projectConfig } from "@/config/project.config";
import { protocolAddress } from "@/lib/deployment-manifest";

const contractScope = protocolAddress?.slice(2).toLowerCase() ?? "pending";

export const referralCookieName = `cns_ref_v1_${projectConfig.chain.id}_${contractScope}`;

export function clearReferralAttribution() {
  if (typeof document === "undefined") return;
  document.cookie = `${referralCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
}
