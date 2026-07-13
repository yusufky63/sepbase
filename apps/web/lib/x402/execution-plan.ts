import { createHash } from "node:crypto";
import {
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { X402RegistrationError } from "./errors";
import {
  NORMALIZATION_ATTESTATION_DOMAIN_NAME,
  NORMALIZATION_ATTESTATION_DOMAIN_VERSION,
} from "./constants";
import type {
  NormalizationAttestation,
  RegistrationExecutionPlan,
  RegistrationExecutionStep,
  RegistrationExecutionStepKind,
} from "./types";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const selectorSchema = z.string().regex(/^0x[a-fA-F0-9]{8}$/);
const calldataSchema = z.string().regex(/^0x(?:[a-fA-F0-9]{2}){4,}$/);
const uintSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/);
const UINT64_MAX = (1n << 64n) - 1n;

const stepSchema = z.object({
  kind: z.enum(["commit", "reveal"]),
  target: addressSchema,
  selector: selectorSchema,
  calldata: calldataSchema,
  valueBaseUnits: uintSchema,
}).strict();

const unsignedPlanSchema = z.object({
  schema: z.literal("sepbase.x402.registration-plan.v1"),
  quoteId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  chainId: z.number().int().positive(),
  network: z.string().regex(/^eip155:[1-9]\d*$/),
  normalizationAttestation: z.object({
    schema: z.literal("sepbase.normalization-attestation.v1"),
    domain: z.object({
      name: z.literal(NORMALIZATION_ATTESTATION_DOMAIN_NAME),
      version: z.literal(NORMALIZATION_ATTESTATION_DOMAIN_VERSION),
    }).strict(),
    claims: z.object({
      chainId: z.number().int().positive(),
      controller: addressSchema,
      normalizationProfileHash: bytes32Schema,
      labelHash: bytes32Schema,
      recipient: addressSchema,
      validUntil: uintSchema,
    }).strict(),
    typedDataDigest: bytes32Schema,
    controllerAttestationHash: bytes32Schema,
    signature: signatureSchema,
  }).strict(),
  steps: z.tuple([stepSchema.extend({ kind: z.literal("commit") }), stepSchema.extend({ kind: z.literal("reveal") })]),
  revealWindow: z.object({
    clock: z.enum(["block", "timestamp"]),
    minimumAge: uintSchema,
    maximumAge: uintSchema,
  }).strict(),
}).strict();

export type RegistrationExecutionPlanPolicy = {
  chainId: number;
  allowNativeValue: boolean;
  allowlist: Record<RegistrationExecutionStepKind, {
    target: Address;
    selector: Hex;
  }>;
  normalization: {
    attestor: Address;
    controller: Address;
    normalizationProfileHash: Hex;
  };
};

type UnsignedPlan = Omit<RegistrationExecutionPlan, "planId">;

function canonicalPlan(unsigned: UnsignedPlan) {
  return JSON.stringify([
    unsigned.schema,
    unsigned.quoteId,
    unsigned.chainId,
    unsigned.network,
    unsigned.normalizationAttestation.schema,
    unsigned.normalizationAttestation.domain.name,
    unsigned.normalizationAttestation.domain.version,
    unsigned.normalizationAttestation.claims.chainId,
    unsigned.normalizationAttestation.claims.controller.toLowerCase(),
    unsigned.normalizationAttestation.claims.normalizationProfileHash.toLowerCase(),
    unsigned.normalizationAttestation.claims.labelHash.toLowerCase(),
    unsigned.normalizationAttestation.claims.recipient.toLowerCase(),
    unsigned.normalizationAttestation.claims.validUntil,
    unsigned.normalizationAttestation.typedDataDigest.toLowerCase(),
    unsigned.normalizationAttestation.controllerAttestationHash.toLowerCase(),
    unsigned.normalizationAttestation.signature.toLowerCase(),
    ...unsigned.steps.flatMap((step) => [
      step.kind,
      step.target.toLowerCase(),
      step.selector.toLowerCase(),
      step.calldata.toLowerCase(),
      step.valueBaseUnits,
    ]),
    unsigned.revealWindow.clock,
    unsigned.revealWindow.minimumAge,
    unsigned.revealWindow.maximumAge,
  ]);
}

export function registrationExecutionPlanId(unsigned: UnsignedPlan) {
  return `sha256:${createHash("sha256").update(canonicalPlan(unsigned)).digest("hex")}` as const;
}

const normalizationAttestationTypes = {
  NormalizationAttestation: [
    { name: "chainId", type: "uint256" },
    { name: "controller", type: "address" },
    { name: "normalizationProfileHash", type: "bytes32" },
    { name: "labelHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

function normalizationTypedData(
  attestation: NormalizationAttestation,
  policy: RegistrationExecutionPlanPolicy,
) {
  const { claims } = attestation;
  return {
    domain: {
      name: NORMALIZATION_ATTESTATION_DOMAIN_NAME,
      version: NORMALIZATION_ATTESTATION_DOMAIN_VERSION,
      chainId: policy.chainId,
      verifyingContract: policy.normalization.controller,
    },
    types: normalizationAttestationTypes,
    primaryType: "NormalizationAttestation" as const,
    message: {
      chainId: BigInt(claims.chainId),
      controller: getAddress(claims.controller),
      normalizationProfileHash: claims.normalizationProfileHash as Hex,
      labelHash: claims.labelHash as Hex,
      recipient: getAddress(claims.recipient),
      validUntil: BigInt(claims.validUntil),
    },
  };
}

export function normalizationControllerAttestationHash(
  validUntil: string,
  signature: Hex,
) {
  const expiry = BigInt(validUntil);
  if (expiry < 0n || expiry > UINT64_MAX) {
    throw new X402RegistrationError(
      503,
      "NORMALIZATION_ATTESTATION_SCOPE_MISMATCH",
      "The normalization attestation validity is outside uint64 bounds.",
    );
  }
  return keccak256(encodeAbiParameters(
    [{ type: "uint64" }, { type: "bytes32" }],
    [expiry, keccak256(signature)],
  ));
}

export async function assertNormalizationAttestation(
  attestation: NormalizationAttestation,
  policy: RegistrationExecutionPlanPolicy,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const { claims } = attestation;
  if (
    attestation.domain.name !== NORMALIZATION_ATTESTATION_DOMAIN_NAME
    || attestation.domain.version !== NORMALIZATION_ATTESTATION_DOMAIN_VERSION
    || claims.chainId !== policy.chainId
    || claims.controller.toLowerCase() !== policy.normalization.controller.toLowerCase()
    || claims.normalizationProfileHash.toLowerCase()
      !== policy.normalization.normalizationProfileHash.toLowerCase()
    || BigInt(claims.validUntil) > UINT64_MAX
    || BigInt(claims.validUntil) <= BigInt(nowSeconds)
  ) {
    throw new X402RegistrationError(503, "NORMALIZATION_ATTESTATION_SCOPE_MISMATCH", "The normalization attestation is expired or outside the immutable V3 policy.");
  }
  const typedData = normalizationTypedData(attestation, policy);
  const digest = hashTypedData(typedData);
  if (digest.toLowerCase() !== attestation.typedDataDigest.toLowerCase()) {
    throw new X402RegistrationError(503, "NORMALIZATION_ATTESTATION_HASH_MISMATCH", "The normalization attestation hash is invalid.");
  }
  if (
    normalizationControllerAttestationHash(claims.validUntil, attestation.signature)
      .toLowerCase() !== attestation.controllerAttestationHash.toLowerCase()
  ) {
    throw new X402RegistrationError(
      503,
      "NORMALIZATION_CONTROLLER_ATTESTATION_HASH_MISMATCH",
      "The controller attestation hash is invalid.",
    );
  }
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      ...typedData,
      signature: attestation.signature as Hex,
    });
  } catch {
    throw new X402RegistrationError(503, "NORMALIZATION_ATTESTATION_INVALID", "The normalization attestation signature is invalid.");
  }
  if (recovered.toLowerCase() !== policy.normalization.attestor.toLowerCase()) {
    throw new X402RegistrationError(503, "NORMALIZATION_ATTESTOR_MISMATCH", "The normalization attestation was not issued by the immutable attestor.");
  }
}

export async function assertRegistrationExecutionPlanPolicy(
  plan: RegistrationExecutionPlan,
  policy: RegistrationExecutionPlanPolicy,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const { planId, ...unsigned } = plan;
  if (registrationExecutionPlanId(unsigned) !== planId) {
    throw new X402RegistrationError(503, "EXECUTION_PLAN_INTEGRITY_FAILED", "The execution plan contents do not match its identifier.");
  }
  if (plan.chainId !== policy.chainId || plan.network !== `eip155:${policy.chainId}`) {
    throw new X402RegistrationError(503, "EXECUTION_PLAN_CHAIN_MISMATCH", "The execution plan belongs to another chain.");
  }
  for (const step of plan.steps) {
    const allowed = policy.allowlist[step.kind];
    if (
      step.target.toLowerCase() !== allowed.target.toLowerCase()
      || step.selector.toLowerCase() !== allowed.selector.toLowerCase()
      || step.calldata.slice(0, 10).toLowerCase() !== allowed.selector.toLowerCase()
      || (!policy.allowNativeValue && step.valueBaseUnits !== "0")
    ) {
      throw new X402RegistrationError(
        503,
        "EXECUTION_PLAN_POLICY_MISMATCH",
        "The execution plan contains calldata outside the managed signer allowlist.",
      );
    }
  }
  if (
    BigInt(plan.revealWindow.minimumAge) === 0n
    || BigInt(plan.revealWindow.maximumAge) < BigInt(plan.revealWindow.minimumAge)
  ) {
    throw new X402RegistrationError(503, "INVALID_REVEAL_WINDOW", "The commit/reveal window is invalid.");
  }
  await assertNormalizationAttestation(plan.normalizationAttestation, policy, nowSeconds);
}

export async function buildRegistrationExecutionPlan(options: {
  value: Omit<RegistrationExecutionPlan, "planId">;
  policy: RegistrationExecutionPlanPolicy;
  nowSeconds?: number;
}) {
  const parsed = unsignedPlanSchema.safeParse(options.value);
  if (!parsed.success) {
    throw new X402RegistrationError(503, "INVALID_EXECUTION_PLAN", "The V3 adapter returned an invalid execution plan.");
  }
  const normalized = parsed.data as UnsignedPlan;
  const plan: RegistrationExecutionPlan = {
    ...normalized,
    chainId: normalized.chainId,
    network: normalized.network as `eip155:${number}`,
    normalizationAttestation: {
      ...normalized.normalizationAttestation,
      claims: {
        ...normalized.normalizationAttestation.claims,
        controller: getAddress(normalized.normalizationAttestation.claims.controller),
        recipient: getAddress(normalized.normalizationAttestation.claims.recipient),
        normalizationProfileHash:
          normalized.normalizationAttestation.claims.normalizationProfileHash as Hex,
        labelHash: normalized.normalizationAttestation.claims.labelHash as Hex,
      },
      typedDataDigest: normalized.normalizationAttestation.typedDataDigest as Hex,
      controllerAttestationHash:
        normalized.normalizationAttestation.controllerAttestationHash as Hex,
      signature: normalized.normalizationAttestation.signature as Hex,
    },
    quoteId: normalized.quoteId as `sha256:${string}`,
    steps: [
      {
        ...normalized.steps[0],
        target: getAddress(normalized.steps[0].target),
        selector: normalized.steps[0].selector as Hex,
        calldata: normalized.steps[0].calldata as Hex,
      },
      {
        ...normalized.steps[1],
        target: getAddress(normalized.steps[1].target),
        selector: normalized.steps[1].selector as Hex,
        calldata: normalized.steps[1].calldata as Hex,
      },
    ],
    planId: registrationExecutionPlanId(normalized),
  };
  await assertRegistrationExecutionPlanPolicy(plan, options.policy, options.nowSeconds);
  return plan;
}

export function executionStep(
  plan: RegistrationExecutionPlan,
  kind: RegistrationExecutionStepKind,
): RegistrationExecutionStep {
  const step = plan.steps.find((candidate) => candidate.kind === kind);
  if (!step) {
    throw new X402RegistrationError(503, "INVALID_EXECUTION_PLAN", "The execution plan is missing a required step.");
  }
  return step;
}
