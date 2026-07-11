# SEPBASE Blockscout BENS handoff

> Status: dApp integration ready; Blockscout BENS indexing is not enabled by this standalone deployment.

## Canonical inputs

- Deployment metadata: `/.well-known/chain-name-service.json`
- Contract ABI: `/abi/ChainNameService.json`
- Verified reverse API: `/api/reverse/{address}`
- Name state API: `/api/name/{label}`

Do not copy chain, contract, suffix, settlement, deployment block, or endpoint values into an adapter. Load them from the deployment manifest and reject unsupported schema versions.

## Why a separate adapter is required

Blockscout BENS does not consume this dApp's REST API or manifest directly. Explorer-native name search requires:

1. A Graph Node subgraph that implements the BENS-compatible ENS GraphQL schema.
2. A hosted BENS service configured for that subgraph.
3. A Blockscout instance or hosted `blockscout-rs` change that registers the name service.
4. `MICROSERVICE_BENS_ENABLED` and `MICROSERVICE_BENS_URL` on the target Blockscout instance.

Those services are external deployment infrastructure and are intentionally not embedded in the standalone SEPBASE web application.

Reference: <https://docs.blockscout.com/setup/microservices/blockscout-ens-bens-name-service-integration>

## Event mapping

| SEPBASE event | Adapter responsibility |
| --- | --- |
| `NameRegistered` | Create/update the domain, registration, registrant, owner, token ID, creation time, and expiry. |
| `NameRenewed` | Update the registration and domain expiry. |
| `NameDataUpdated` | Update the effective resolved address and public record snapshot. |
| `PrimaryNameChanged` | Update or clear the address-to-primary association. |
| ERC-721 `Transfer` | Update registrant/owner and clear stale resolution/primary state according to contract behavior. |

Marketplace and referral events are not naming records and must not be mapped into BENS domain ownership.

## Primary-name semantics

SEPBASE primary names are explicitly selected and forward-confirmed. An adapter must only expose a primary name when all of the following hold at the indexed block:

- lifecycle is `ACTIVE` or `GRACE`;
- the token owner is the address;
- the name resolves to the same address;
- the current primary token maps back to the same full name.

Do not substitute Blockscout's generic "first unexpired name" fallback for SEPBASE's user-selected primary semantics.

## Release gate

Explorer integration is complete only after the subgraph is replayed from the manifest deployment block, BENS queries match `/api/reverse/{address}` fixtures, the target Blockscout instance displays names, and re-registration/transfer/expiry cases pass end-to-end tests.
