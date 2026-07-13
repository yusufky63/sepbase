# @sepbase/mcp

Model Context Protocol access to one verified SEPBASE deployment. The package exposes two explicit server factories:

- `createSepbaseMcpServer` is the compatible legacy surface currently used by the bundled hosted HTTP and stdio entrypoints.
- `createSepbaseV3McpServer` is the opt-in V3 suite surface. It uses `createSepbaseV3Client`, reads all seven manifest-verified modules, and returns read results or unsigned guarded transaction plans only.

## Security boundary

- The servers expose public on-chain data only. They have no database, indexer, account session, signer, wallet credential, transaction broadcaster, or x402 authorization handler.
- V3 transaction tools call the guarded SDK preparation methods and serialize the resulting destination, expected sender, calldata, native value, pinned block, and exact ERC-20 approval plan when required. A wallet must independently review, simulate, sign, and send each transaction.
- `prepare_marketplace_approval` is a separate least-authority ERC-721 approval plan for one token ID. It verifies current ownership and existing approval at one block and never substitutes blanket `setApprovalForAll` authority.
- A generated plan can become stale after its pinned read block. Contract-level expected price, amount, fee, transfer-nonce, listing-nonce, auction-nonce, and owner guards remain the final safety boundary.
- V3 MCP registration is deliberately requirements-only. `registration_requirements` returns canonical normalization, EIP-712 field definitions, economic guards, commit timing, and x402 routing. It accepts neither commitment preimages nor attestor output and never calls the SDK commit/reveal preparation methods.
- Paid registration does not run through MCP. The current release reports x402 quote/readiness and keeps paid execution unavailable; any future reviewed paid flow must use the configured x402 boundary.
- Tool arguments cannot supply a manifest URL, RPC URL, contract address, ABI, or chain. Remote HTTP locks discovery to the application's configured canonical site origin, independent of request `Host` headers. Stdio accepts deployment endpoints only from operator-controlled environment variables.
- SDK transport and manifest failures are converted to stable MCP error codes. Raw RPC error objects, provider URLs, credentials, stack traces, and response bodies are not returned to agents.
- This is SEPBASE's standalone, single-chain protocol. V3 provides ENS-compatible registry and resolution reads but does not add external name-service integration, cross-chain resolution, subdomains, or account abstraction.

## Legacy tools

`resolve_name`, `reverse_resolve`, `check_availability`, `name_info`, `quote_registration`, `market_listings`, `protocol_health`, and `prepare_registration`.

## V3 tools

The opt-in V3 surface exposes 39 tools: 16 read-only tools and 23 unsigned plan tools.

Read-only tools:

`normalize`, `name_info`, `resolve_name`, `resolve_text`, `reverse`, `owned_names`, `account_balances`, `quote_registration`, `registration_requirements`, `market_listings`, `global_offers`, `buyer_offers`, `owner_offers`, `market_auctions`, `protocol_liabilities`, and `migration_status`. `migration_status` accepts an optional account with an exact legacy label to return block-pinned claim eligibility; it never normalizes a different raw input into a v2 identity.

Unsigned plan tools:

`prepare_renewal`, `prepare_marketplace_approval`, `prepare_listing`, `prepare_listing_update`, `prepare_listing_cancel`, `prepare_listing_invalidate`, `prepare_buy`, `prepare_offer`, `prepare_offer_accept`, `prepare_offer_cancel`, `prepare_offer_invalidate`, `prepare_auction_start`, `prepare_auction_cancel`, `prepare_bid`, `prepare_auction_finalize`, `prepare_marketplace_claim`, `prepare_referral_claim`, `prepare_text_record`, `prepare_address_record`, `prepare_primary_name`, `prepare_primary_name_clear`, `prepare_transfer`, and `prepare_migration_claim`.

All token IDs, cursors, block numbers, timestamps, and settlement base-unit amounts are JSON-safe decimal strings. Formatted settlement values always use manifest decimals and symbol; native settlement, 18 decimals, or a particular token is never assumed.

## Programmatic V3 server

```ts
import { createSepbaseV3McpServer } from "@sepbase/mcp";

const server = createSepbaseV3McpServer({
  manifestUrl: "https://names.example/.well-known/chain-name-service-v3.json",
  allowedManifestOrigins: ["https://names.example"],
  allowedRpcOrigins: ["https://base-sepolia-rpc.example"],
});
```

The factory lazily creates and caches one verified `SepbaseV3Client`; a failed construction is not cached. Tool discovery therefore performs no RPC request. Selecting this factory is explicit: importing it does not change the bundled legacy HTTP or stdio servers.

For a stateless remote route, import the separate V3 handler without replacing the compatible legacy export:

```ts
import { handleSepbaseV3McpPost } from "@sepbase/mcp/v3-http";

export function POST(request: Request) {
  return handleSepbaseV3McpPost(request, {
    manifestUrl: "https://names.example/.well-known/chain-name-service-v3.json",
    allowedRequestOrigins: ["https://names.example"],
  });
}
```

## Stdio

The bundled stdio entrypoint defaults to the compatible legacy server. Build the package, then configure the MCP host to run `mcp-server-sepbase` with:

```text
SEPBASE_MANIFEST_URL=https://names.example/.well-known/chain-name-service.json
SEPBASE_RPC_URL=https://optional-server-rpc.example
```

`SEPBASE_MANIFEST_URL` is required and public. `SEPBASE_RPC_URL` is optional; when absent, the verified manifest RPC is used. If an authenticated RPC URL is used, keep it in the host environment and never pass it as a tool argument or commit it.

Set `SEPBASE_MCP_SUITE=v3` only when the manifest URL points to the reviewed V3 suite manifest. Omitting the variable, or setting it to `legacy`, preserves the existing behavior. Any other value fails closed during startup.

## Streamable HTTP

The bundled Next.js route is `/api/mcp` and declares MCP protocol version `2025-11-25`. It creates a fresh legacy server and transport for every `POST`, disables MCP sessions and resumability, and supports JSON responses. `GET` and `DELETE` are intentionally rejected because this deployment has no server-initiated notifications or persistent session state. Applications may wire `handleSepbaseV3McpPost` to a separate route after their V3 production manifest has been deployed and smoke-tested.

Clients advertise both `application/json` and `text/event-stream`; subsequent requests send `MCP-Protocol-Version`. Browser requests that include `Origin` are accepted only from the configured canonical site origin. Non-browser clients may omit Origin. Request bodies are limited to 64 KiB. Deployments should add edge rate limits, timeouts, and abuse monitoring before opening public traffic.

The current repository release keeps x402 quote-only. Neither MCP factory calls the x402 registration execution route.
