export function v3MarketWorkspaceScopeKey(
  address: string | undefined,
  chainId: number | undefined,
) {
  return `${address?.toLowerCase() ?? "disconnected"}:${chainId ?? "no-chain"}`;
}
