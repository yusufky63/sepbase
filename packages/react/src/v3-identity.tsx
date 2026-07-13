"use client";

import type { CSSProperties } from "react";
import { getAddress, isAddress } from "viem";
import { useSepbaseV3Identity } from "./v3-provider.js";

export type SepbaseV3IdentityProps = {
  address: string;
  className?: string;
  profileBaseUrl?: string;
  showAddress?: boolean;
};

const rootStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--sepbase-identity-background, transparent)",
  border: "1px solid var(--sepbase-identity-border, currentColor)",
  color: "var(--sepbase-identity-foreground, currentColor)",
  display: "inline-flex",
  flexWrap: "wrap",
  fontFamily: "var(--sepbase-identity-font, ui-monospace, monospace)",
  fontSize: "0.8125rem",
  gap: "0.5rem",
  lineHeight: 1.2,
  maxWidth: "100%",
  minHeight: "2rem",
  padding: "0.375rem 0.5rem",
  textDecoration: "none",
};

const nameStyle: CSSProperties = {
  fontFamily: "var(--sepbase-identity-name-font, ui-sans-serif, system-ui, sans-serif)",
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const badgeStyle: CSSProperties = {
  background: "var(--sepbase-identity-accent, #0000ff)",
  color: "var(--sepbase-identity-accent-contrast, #ffffff)",
  fontSize: "0.625rem",
  fontWeight: 700,
  padding: "0.1875rem 0.3125rem",
};

const addressStyle: CSSProperties = {
  color: "var(--sepbase-identity-muted, currentColor)",
  opacity: 0.68,
};

function shortAddress(address: string) {
  if (!isAddress(address)) return "Invalid address";
  const normalized = getAddress(address);
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function verifiedLabel(name: string | null) {
  if (!name) return null;
  const separator = name.indexOf(".");
  return separator > 0 ? name.slice(0, separator) : null;
}

function profileHref(baseUrl: string | undefined, name: string | null) {
  const label = verifiedLabel(name);
  if (!baseUrl || !label) return null;
  return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(label)}`;
}

export function SepbaseV3Identity({
  address,
  className,
  profileBaseUrl,
  showAddress = true,
}: SepbaseV3IdentityProps) {
  const result = useSepbaseV3Identity(address);
  const verified = result.status === "verified" && result.identity?.verified === true;
  const name = verified ? result.identity?.name ?? null : null;
  const fallback = shortAddress(address);
  const href = profileHref(profileBaseUrl, name);
  const content = (
    <>
      <span style={nameStyle}>{name ?? fallback}</span>
      {verified ? <span style={badgeStyle}>V3 VERIFIED</span> : null}
      {verified && showAddress ? <span style={addressStyle}>{fallback}</span> : null}
    </>
  );
  const label = result.status === "loading"
    ? `Resolving SEPBASE V3 identity for ${address}`
    : result.status === "error"
      ? `SEPBASE V3 identity is unavailable for ${address}`
    : verified
      ? `${name} is forward-confirmed for ${address} on SEPBASE V3`
      : `No verified SEPBASE V3 primary name for ${address}`;

  if (href && verified) {
    return (
      <a
        aria-label={label}
        className={className}
        data-sepbase-state={result.status}
        data-sepbase-version="3"
        href={href}
        style={rootStyle}
        title={address}
      >
        {content}
      </a>
    );
  }

  return (
    <span
      aria-label={label}
      aria-live="polite"
      className={className}
      data-sepbase-state={result.status}
      data-sepbase-version="3"
      role="status"
      style={rootStyle}
      title={address}
    >
      {content}
    </span>
  );
}
