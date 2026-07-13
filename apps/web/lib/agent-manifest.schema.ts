import { z } from "zod";
import { isSafeOriginRelativePath } from "./safe-route-path";

const routePath = z.string()
  .refine(isSafeOriginRelativePath, "Must be a safe same-origin path without traversal.");

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const agentIntegrationManifestSchema = z.object({
  schemaVersion: z.literal(4),
  kind: z.literal("sepbase-agent-integration"),
  name: z.string().min(1),
  description: z.string().min(1),
  protocol: z.object({
    chainId: z.number().int().positive().safe(),
    chainName: z.string().min(1),
    testnet: z.boolean(),
    suffix: z.string().min(1),
    contract: z.union([addressSchema, z.null()]),
  }).strict(),
  discovery: z.object({
    deploymentManifest: routePath,
    v3TargetManifest: routePath,
    v3Status: routePath,
    v3Name: routePath,
    v3Market: routePath,
    v3Health: routePath,
    v3Mcp: routePath,
    v3NormalizationAttestation: routePath,
    v3Account: routePath,
    openApi: routePath,
    documentation: routePath,
    llms: routePath,
  }).strict(),
  mcp: z.object({
    endpoint: routePath,
    protocolVersion: z.literal("2025-11-25"),
    transport: z.literal("streamable-http"),
    sessionMode: z.literal("stateless"),
    authentication: z.literal("none"),
    requestOriginPolicy: z.literal("configured-origin-or-no-origin"),
    transactionAuthority: z.literal("none"),
    tools: z.array(z.enum([
      "resolve_name",
      "reverse_resolve",
      "check_availability",
      "name_info",
      "quote_registration",
      "market_listings",
      "protocol_health",
      "prepare_registration",
    ])).min(1),
  }).strict(),
  x402: z.object({
    specVersion: z.literal(2),
    availability: z.enum(["fail-closed", "available"]),
    implementationStatus: z.enum(["v3-contract-pending", "activation-gated", "operational"]),
    paidExecutionAvailable: z.boolean(),
    pinnedPackages: z.object({
      "@x402/core": z.literal("2.18.0"),
      "@x402/evm": z.literal("2.18.0"),
      "@x402/extensions": z.literal("2.18.0"),
      workflow: z.literal("4.6.0"),
    }).strict(),
    settlementTarget: z.object({
      status: z.enum(["v3-target", "live"]),
      network: z.string().regex(/^eip155:[1-9]\d*$/),
      kind: z.literal("erc20"),
      asset: addressSchema,
      symbol: z.literal("USDC"),
      decimals: z.literal(6),
      gasCurrency: z.string().min(1).max(16),
      testnetValueDisclaimer: z.literal(true),
    }).strict(),
    quoteEndpoint: routePath,
    resourceEndpoint: routePath,
    statusEndpoint: routePath,
    defaultEnabled: z.literal(false),
    registrationMode: z.literal("optional-keeper-mediated"),
    paymentRequiredHeader: z.literal("PAYMENT-REQUIRED"),
    paymentSignatureHeader: z.literal("PAYMENT-SIGNATURE"),
    paymentResponseHeader: z.literal("PAYMENT-RESPONSE"),
    registrationScope: z.tuple([
      z.literal("chainId"),
      z.literal("network"),
      z.literal("contract"),
      z.literal("resource"),
      z.literal("quoteId"),
      z.literal("label"),
      z.literal("recipient"),
      z.literal("durationYears"),
      z.literal("referrer"),
      z.literal("expectedAmountBaseUnits"),
      z.literal("expectedReferralRewardBps"),
      z.literal("expiresAt"),
    ]),
    paymentAcceptanceScope: z.tuple([
      z.literal("x402Version"),
      z.literal("scheme"),
      z.literal("network"),
      z.literal("asset"),
      z.literal("amountBaseUnits"),
      z.literal("payTo"),
    ]),
    idempotencyScope: z.tuple([
      z.literal("paymentIdentifier"),
      z.literal("requestFingerprint"),
      z.literal("quoteId"),
    ]),
    activationRequirements: z.tuple([
      z.literal("v3-commit-reveal-deployment"),
      z.literal("matching-six-decimal-erc20"),
      z.literal("official-x402-v2-runtime"),
      z.literal("reviewed-facilitator"),
      z.literal("authenticated-quote-and-attestation"),
      z.literal("durable-payment-idempotency"),
      z.literal("managed-limited-keeper"),
      z.literal("durable-commit-reveal-workflow"),
      z.literal("runtime-quote-revalidation"),
      z.literal("monitoring-reconciliation-refund-e2e"),
    ]),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  if (manifest.x402.settlementTarget.network !== `eip155:${manifest.protocol.chainId}`) {
    context.addIssue({
      code: "custom",
      path: ["x402", "settlementTarget", "network"],
      message: "The x402 target network must match the protocol chain.",
    });
  }
  if (manifest.x402.paidExecutionAvailable) {
    if (
      manifest.x402.availability !== "available"
      || manifest.x402.implementationStatus !== "operational"
      || manifest.x402.settlementTarget.status !== "live"
    ) {
      context.addIssue({
        code: "custom",
        path: ["x402", "paidExecutionAvailable"],
        message: "Paid x402 availability requires an operational runtime and live settlement target.",
      });
    }
  } else if (
    manifest.x402.availability !== "fail-closed"
    || !["v3-contract-pending", "activation-gated"].includes(manifest.x402.implementationStatus)
  ) {
    context.addIssue({
      code: "custom",
      path: ["x402", "paidExecutionAvailable"],
      message: "Unavailable paid x402 must remain fail-closed and activation-gated.",
    });
  }
});

export type AgentIntegrationManifest = z.infer<typeof agentIntegrationManifestSchema>;
