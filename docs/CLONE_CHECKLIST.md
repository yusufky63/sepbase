# Clone Checklist

1. Choose one EVM chain and one suffix.
2. Replace the brand profile and brand assets.
3. Set native gas currency metadata independently from settlement metadata.
4. Select the chain fee-estimation model (`standard` or configured `op-stack` oracle addresses).
5. Choose exactly one immutable settlement mode: `native` or a standard `erc20`.
6. Clear every previous contract address, block number, owner, treasury, token address, and base-unit price.
7. Set the human-readable 4-32 character annual price and the 1/2/3 character multiplier tuple.
8. Configure a dated fiat reference only for a production profile; keep it null on testnets. Configure the optional UI-only market reference separately or disable it.
9. Validate RPC, Multicall3, explorer, owner, treasury, collection metadata, and metadata origin.
10. Deploy a fresh `ChainNameService` contract.
11. Regenerate ABI, manifest v3, OpenAPI, and `llms.txt` outputs.
12. Verify 1/2/3/4-character quotes, network-fee estimation, and native plus 6-decimal ERC-20 fixtures before release.
