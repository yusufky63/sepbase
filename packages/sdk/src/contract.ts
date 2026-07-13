import { type Abi, type Chain, createPublicClient, defineChain, getAddress, http, type PublicClient } from "viem";
import { ManifestMismatchError, NotDeployedError, RpcUnavailableError, SepbaseError } from "./errors.js";
import { assertSafeFetchResponse, loadManifest, resolveManifestUrl } from "./manifest.js";
import type { ChainNameManifest } from "./types.js";

export type ContractContext = {
  abi: Abi;
  chain: Chain;
  manifest: ChainNameManifest;
  origin: URL;
  publicClient: PublicClient;
};

function isPrivateNetworkHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1") return false;
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

function validateRpcUrl(value: string, allowedOrigins?: readonly string[]) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new ManifestMismatchError("RPC URLs must use HTTPS outside loopback development.");
  }
  if (isPrivateNetworkHost(url.hostname)) {
    throw new ManifestMismatchError("RPC URL cannot target a private network address.");
  }
  if (url.username || url.password) {
    throw new ManifestMismatchError("RPC URL cannot contain embedded credentials.");
  }
  if (allowedOrigins && !allowedOrigins.map((origin) => new URL(origin).origin).includes(url.origin)) {
    throw new ManifestMismatchError("RPC origin is not in the explicit allowlist.");
  }
  return url.href;
}

function validateManifestUrl(value: string | URL) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new ManifestMismatchError("Manifest URLs must use HTTPS outside loopback development.");
  }
  if (isPrivateNetworkHost(url.hostname)) {
    throw new ManifestMismatchError("Manifest URL cannot target a private network address.");
  }
  if (url.username || url.password) {
    throw new ManifestMismatchError("Manifest URL cannot contain embedded credentials.");
  }
  return url;
}

export async function createContractContext(
  manifestUrl: string | URL,
  fetcher: typeof fetch = fetch,
  rpcOverride?: string,
  allowedRpcOrigins?: readonly string[],
): Promise<ContractContext> {
  const safeManifestUrl = validateManifestUrl(manifestUrl);
  const { manifest, origin } = await loadManifest(safeManifestUrl, fetcher);
  if (!manifest.contract) throw new NotDeployedError();
  if (!manifest.abiSha256) throw new ManifestMismatchError("A deployed manifest must publish an ABI SHA-256 checksum.");
  const abiUrl = resolveManifestUrl(manifest.abiUrl, origin);
  const abiResponse = await fetcher(abiUrl, { redirect: "manual" });
  assertSafeFetchResponse(abiResponse, abiUrl, "Contract ABI");
  if (!abiResponse.ok) {
    throw new SepbaseError("The contract ABI could not be loaded.", "ABI_UNAVAILABLE", abiResponse.status);
  }
  const abiBytes = await abiResponse.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", abiBytes);
  const abiSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (abiSha256 !== manifest.abiSha256) {
    throw new ManifestMismatchError("The downloaded ABI does not match the manifest checksum.");
  }
  let abi: Abi;
  try {
    abi = JSON.parse(new TextDecoder().decode(abiBytes)) as Abi;
  } catch {
    throw new ManifestMismatchError("The downloaded ABI is not valid JSON.");
  }
  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.chainName,
    nativeCurrency: manifest.nativeCurrency,
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: manifest.explorerUrl } },
    contracts: {
      multicall3: {
        address: getAddress(manifest.multicall3.address),
        blockCreated: manifest.multicall3.blockCreated,
      },
    },
    testnet: manifest.testnet,
  });
  const rpcUrl = validateRpcUrl(rpcOverride ?? manifest.rpcUrl, allowedRpcOrigins);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { fetchOptions: { redirect: "error" } }),
  });
  try {
    const [rpcChainId, bytecode, multicallBytecode, version] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getBytecode({ address: manifest.contract }),
      publicClient.getBytecode({ address: getAddress(manifest.multicall3.address) }),
      publicClient.readContract({ address: manifest.contract, abi, functionName: "VERSION" }),
    ]);
    if (rpcChainId !== manifest.chainId) throw new ManifestMismatchError("RPC chain ID does not match the manifest.");
    if (!bytecode || bytecode === "0x") throw new ManifestMismatchError("Manifest contract address has no bytecode.");
    if (!multicallBytecode || multicallBytecode === "0x") {
      throw new ManifestMismatchError("Manifest Multicall3 address has no bytecode.");
    }
    if (version !== manifest.contractVersion) throw new ManifestMismatchError("Contract VERSION does not match the manifest.");
  } catch (error) {
    if (error instanceof ManifestMismatchError) throw error;
    throw new RpcUnavailableError();
  }
  return { abi, chain, manifest, origin, publicClient: publicClient as PublicClient };
}
