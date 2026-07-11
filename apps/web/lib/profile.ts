import type { NameProfile } from "@/lib/contract/types";
import { getUtf8ByteLength } from "@/lib/name-normalization";

export { getUtf8ByteLength } from "@/lib/name-normalization";

export const profileByteLimits: Record<keyof NameProfile, number> = {
  displayName: 64,
  bio: 280,
  avatar: 256,
  website: 256,
  twitter: 64,
  github: 64,
};

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function safeHttpsUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || isPrivateHost(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function socialProfileUrl(network: "twitter" | "github", handle: string) {
  const value = handle.replace(/^@/, "");
  if (network === "twitter" && !/^[A-Za-z0-9_]{1,15}$/.test(value)) return null;
  if (network === "github" && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) return null;
  return `https://${network === "twitter" ? "x.com" : "github.com"}/${encodeURIComponent(value)}`;
}

export function profileValidationError(profile: NameProfile) {
  for (const field of Object.keys(profileByteLimits) as Array<keyof NameProfile>) {
    if (getUtf8ByteLength(profile[field]) > profileByteLimits[field]) {
      return `${field} exceeds the ${profileByteLimits[field]} byte onchain limit.`;
    }
  }
  if (profile.avatar && !safeHttpsUrl(profile.avatar)) return "Avatar must be a public HTTPS URL.";
  if (profile.website && !safeHttpsUrl(profile.website)) return "Website must be a public HTTPS URL.";
  if (profile.twitter && !socialProfileUrl("twitter", profile.twitter)) return "X username is invalid.";
  if (profile.github && !socialProfileUrl("github", profile.github)) return "GitHub username is invalid.";
  return null;
}
