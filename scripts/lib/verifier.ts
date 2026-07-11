export type ExplorerVerifier = "blockscout" | "etherscan" | "sourcify" | "none";

export type VerifierConfig = {
  apiKey?: string;
  url?: string;
  verifier: ExplorerVerifier;
};

function absoluteUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
}

export function getVerifierConfig(chainId: number): VerifierConfig {
  const verifier = (process.env.EXPLORER_VERIFIER?.trim().toLowerCase() ?? "none") as ExplorerVerifier;
  if (!["blockscout", "etherscan", "sourcify", "none"].includes(verifier)) {
    throw new Error("Unsupported EXPLORER_VERIFIER.");
  }

  const urlValue = process.env.EXPLORER_API_URL?.trim();
  const apiKey = process.env.EXPLORER_API_KEY?.trim();

  if (verifier === "blockscout") {
    if (!urlValue || !absoluteUrl(urlValue, "Blockscout EXPLORER_API_URL").pathname.endsWith("/api/")) {
      throw new Error("Blockscout EXPLORER_API_URL must be an absolute URL ending in /api/.");
    }
  }

  if (verifier === "etherscan") {
    if (!apiKey) throw new Error("Etherscan verification requires EXPLORER_API_KEY.");
    if (urlValue) {
      const url = absoluteUrl(urlValue, "Etherscan EXPLORER_API_URL");
      const validV2Url = url.hostname === "api.etherscan.io"
        && url.pathname === "/v2/api"
        && url.searchParams.get("chainid") === String(chainId);
      if (!validV2Url) {
        throw new Error(
          `Etherscan EXPLORER_API_URL must be blank for a supported chain or use the V2 endpoint with chainid=${chainId}.`,
        );
      }
    }
  }

  if (verifier === "sourcify" && urlValue) absoluteUrl(urlValue, "Sourcify EXPLORER_API_URL");

  return {
    verifier,
    ...(urlValue ? { url: urlValue } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}
