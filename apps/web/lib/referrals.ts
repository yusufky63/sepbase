import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { parseV3SuiteManifest, type V3SuiteManifest } from "@sepbase/sdk";
import { projectConfig } from "@/config/project.config";
import { protocolAddress } from "@/lib/deployment-manifest";
import v3ManifestJson from "../public/deployment-manifest.v3.json";

const contractScope = protocolAddress?.slice(2).toLowerCase() ?? "pending";

export const referralCookieName = `cns_ref_v1_${projectConfig.chain.id}_${contractScope}`;

export function isV3ReferralOperational(manifest: V3SuiteManifest) {
  return manifest.releaseStatus === "live"
    && Boolean(manifest.contracts.controller.address)
    && Object.values(manifest.contracts).every((module) => module.address && module.runtimeCodeHash)
    && manifest.wiring.suiteConfigured;
}

export function v3ReferralCookieNameFor(manifest: V3SuiteManifest) {
  const releaseDigest = manifest.suiteReleaseId.replace(/^sha256:/, "");
  const controller = manifest.contracts.controller.address?.slice(2).toLowerCase() ?? "pending";
  return `cns_ref_v3_${manifest.chainId}_${releaseDigest}_${controller}`;
}

const v3ReferralManifest = parseV3SuiteManifest(v3ManifestJson);
export const v3ReferralCookieName = v3ReferralCookieNameFor(v3ReferralManifest);
export const referralAttributionCookieName = isV3ReferralOperational(v3ReferralManifest)
  ? v3ReferralCookieName
  : referralCookieName;

export function clearReferralAttribution() {
  if (typeof document === "undefined") return;
  document.cookie = `${referralCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function readV3ReferralAttribution(): Address | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${v3ReferralCookieName}=`))
    ?.slice(v3ReferralCookieName.length + 1);
  if (!raw || !isAddress(raw) || raw.toLowerCase() === zeroAddress) return null;
  return getAddress(raw);
}

export function clearV3ReferralAttribution() {
  if (typeof document === "undefined") return;
  document.cookie = `${v3ReferralCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
}
