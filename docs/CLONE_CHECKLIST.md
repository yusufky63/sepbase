# Clone Checklist

1. Choose one EVM chain and one suffix.
2. Replace the brand profile and brand assets.
3. Set native gas currency metadata independently from settlement metadata.
4. Choose exactly one immutable settlement mode: `native` or a standard `erc20`.
5. Clear every previous contract address, block number, owner, treasury, token address, and base-unit price.
6. Set the human-readable 4-32 character annual price and the 1/2/3 character multiplier tuple.
7. Configure a dated fiat reference only for a production profile; keep it null on testnets.
8. Validate RPC, Multicall3, explorer, owner, treasury, collection metadata, and metadata origin.
9. Deploy a fresh `ChainNameService` contract.
10. Regenerate ABI, manifest v3, OpenAPI, and `llms.txt` outputs.
11. Verify 1/2/3/4-character quotes and run native plus 6-decimal ERC-20 fixtures before release.
