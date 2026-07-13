# Paid x402 Base Sepolia operations

Status: **source implemented; runtime provisioning and funded E2E pending**.

This runbook applies only to Base Sepolia (`84532`, `eip155:84532`) and the manifest-verified six-decimal Circle test USDC profile. Test ETH is gas, test USDC is settlement, and neither receives a guaranteed fiat value. The core registry and marketplace remain on-chain; Postgres is allowed only inside this paid execution boundary.

## Runtime boundaries

1. SEPBASE issues an authenticated, short-lived V3 quote and stores its secret-bearing plan in encrypted CAS.
2. The official x402 V2 adapter asks the facilitator to verify the exact payment authorization.
3. A separately funded managed keeper sends only allowlisted commit/reveal transactions under per-order and daily limits.
4. Workflow DevKit resumes commitment-age waits and process loss.
5. SEPBASE reconciles chain receipts/post-state before asking the facilitator to settle. A settlement ambiguity becomes `reconciliation-required`; it is never blindly replayed.

The payment receiver, keeper and managed signer must be one address. The creator/configurator wallet can fund that keeper’s initial Base Sepolia test ETH, test USDC balance and allowance, but its raw deployment key must never enter the web runtime. The owner/treasury Safe remains separate from the keeper.

## Encrypted CAS provisioning

1. Accept and install the Neon integration from the Vercel Marketplace as the account owner.
2. Confirm that `DATABASE_URL` is server-only and scoped to the SEPBASE Vercel project.
3. Generate independent high-entropy values for:
   - `X402_IDEMPOTENCY_STORE_AUTH_TOKEN` (at least 32 random bytes);
   - `X402_STORE_ENCRYPTION_KEY` (exactly 32 random bytes, unpadded base64url);
   - `X402_STORE_ENCRYPTION_KEY_ID` (a versioned non-secret identifier).
4. Run `pnpm x402:store:migrate` from a trusted environment carrying `DATABASE_URL`.
5. Configure `X402_IDEMPOTENCY_STORE_URL` to the final-origin internal route and deploy.
6. Smoke stored/existing/conflict, expired-lease reacquisition and stale-fencing rejection without logging payloads.

AES-256-GCM AAD binds every envelope to its entity and exact primary/secondary IDs. Prepared plans, deterministic challenges, reservations/payment material and facilitator settlement responses use application-level encryption; indexed binding hashes and public transaction/status fields remain queryable in managed Postgres. Changing the active key ID without re-encrypting existing rows intentionally fails closed. A reviewed rotation must pause new paid orders, reconcile all in-flight orders, back up, re-encrypt/verify every envelope, deploy the new key, then resume.

## Keeper activation

- Provision a managed signer (`turnkey`, AWS KMS, GCP KMS, Azure Key Vault or a reviewed external signer); raw private-key environment variables are forbidden.
- Bind `X402_KEEPER_ADDRESS`, `X402_PAY_TO_ADDRESS` and the managed signer response to the same checksum address.
- Set `X402_KEEPER_MAX_ORDER_BASE_UNITS` and `X402_KEEPER_DAILY_LIMIT_BASE_UNITS` in six-decimal test-USDC base units; daily must be at least per-order but deliberately bounded.
- Fund the keeper from the creator/configurator wallet with a limited test-USDC buffer and test ETH. Approve only the verified V3 controller and verify exact allowance/balance at a pinned block.
- The immutable normalization attestor still needs a separately authenticated managed issuer. A keeper cannot substitute for it.

Keep `X402_REGISTRATION_ENABLED=false` until the candidate V3 manifest is paid-enabled and facilitator, CAS, signer, attestor, workflow, monitoring, abuse protection, reconciliation/refund runbook, independent review and funded acceptance matrix J evidence all pass.

## Reconciliation and recovery

- On HTTP timeout, query order status with the original `paymentIdentifier` and `planId`; do not create another payment.
- `confirmed` means the name reveal succeeded but payment settlement is not yet final.
- `reconciliation-required` requires facilitator/chain review and no automatic second authorization.
- `settled` is terminal and idempotently replayable; `terminal-failure` is terminal before settlement.
- Restore drills must prove envelope decryption, global authorization uniqueness and monotonic fencing tokens before paid traffic resumes.
- Alerts must cover store latency/errors, active expired leases, workflow failures, signer limit rejection, keeper gas/USDC/allowance, facilitator verify/settle divergence and reconciliation age.
