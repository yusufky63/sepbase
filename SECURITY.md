# Security policy

## Supported code

Security fixes target the current default branch. This repository is a Base Sepolia test deployment and has not been declared ready for mainnet or meaningful-value use.

## Report a vulnerability

Use [GitHub private security advisories](https://github.com/yusufky63/sepbase/security/advisories/new). Do not open a public issue until a coordinated fix is available.

Include the affected commit or version, impact, prerequisites, minimal reproduction steps, and a safe proof of concept. Never send private keys, seed phrases, production credentials, authenticated RPC URLs, or reusable signed payment payloads.

If the private advisory form is unavailable, do not disclose exploit details publicly. Open a minimal issue asking the maintainer to enable a private reporting channel.

## Scope priorities

- contract ownership, settlement, liabilities, referral, and marketplace correctness;
- transaction guard bypasses or misleading signing flows;
- manifest, ABI, chain, asset, and origin confusion;
- MCP or API authority escalation, SSRF, secret disclosure, and prompt-injection execution;
- x402 payment replay, scope mismatch, idempotency, keeper, or reconciliation failures.

Test assets have no guaranteed fiat value, but testnet vulnerabilities are still useful to report responsibly.
