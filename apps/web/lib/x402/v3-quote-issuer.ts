import { randomBytes } from "node:crypto";
import {
  chainNameControllerV3Abi,
  normalizeName,
  type SepbaseV3Client,
  type V3SuiteManifest,
  type V3ResolverInitialization,
} from "@sepbase/sdk";
import {
  encodeFunctionData,
  getAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { v3Manifest } from "@/lib/v3-api";
import { X402RegistrationError } from "./errors";
import { buildRegistrationExecutionPlan } from "./execution-plan";
import type { V3PaidRegistrationRuntime } from "./runtime-factory";
import {
  createUnsignedV3RegistrationQuote,
  signV3RegistrationQuote,
} from "./v3-quote";
import { v3RegistrationExecutionPolicy } from "./v3-runtime";

export type V3PaidQuoteInput = {
  label: string;
  recipient: Address;
  durationYears: 1 | 2 | 3 | 4 | 5;
  referrer: Address | null;
  initialization: V3ResolverInitialization;
};

type Dependencies = {
  configured: V3PaidRegistrationRuntime;
  client: SepbaseV3Client;
  nowSeconds: number;
  ttlSeconds: number;
  randomSecret?: () => Hex;
  manifest?: V3SuiteManifest;
};

export async function issueV3PaidRegistrationQuote(
  input: V3PaidQuoteInput,
  dependencies: Dependencies,
) {
  const { configured, client } = dependencies;
  const manifest = dependencies.manifest ?? v3Manifest;
  if (client.manifest.suiteReleaseId !== manifest.suiteReleaseId) {
    throw new X402RegistrationError(503, "V3_RELEASE_MISMATCH", "The V3 quote client is bound to another suite release.");
  }
  const normalized = normalizeName(input.label, manifest.suffix, {
    minCodePoints: manifest.nameRules.minCodepoints,
    maxCodePoints: manifest.nameRules.maxCodepoints,
    maxUtf8Bytes: manifest.nameRules.maxUtf8Bytes,
  });
  if (input.label.trim() !== normalized.normalizedLabel) {
    throw new X402RegistrationError(400, "CANONICAL_CONFIRMATION_REQUIRED", "Use the exact normalized label for a paid registration quote.", {
      normalizedSuggestion: normalized.normalizedLabel,
    });
  }
  const payer = configured.runtime.signer.address;
  const attestation = await configured.attestationIssuer.issue({
    rawLabel: normalized.normalizedLabel,
    recipient: input.recipient,
    nowSeconds: dependencies.nowSeconds,
  });
  const secret = dependencies.randomSecret?.() ?? `0x${randomBytes(32).toString("hex")}` as Hex;
  const preparedCommit = await client.prepareRegistrationCommit({
    label: normalized.normalizedLabel,
    payer,
    recipient: input.recipient,
    durationYears: input.durationYears,
    referrer: input.referrer,
    secret,
    initialization: input.initialization,
    attestation: {
      validUntil: BigInt(attestation.claims.validUntil),
      signature: attestation.signature,
    },
  });
  const nameRecord = await client.getNameRecord(
    normalized.normalizedLabel,
    preparedCommit.scope.preparedAtBlock,
  );
  if (
    nameRecord.blockNumber !== preparedCommit.scope.preparedAtBlock
    || !nameRecord.available
    || nameRecord.reserved
  ) {
    throw new X402RegistrationError(409, "NAME_NOT_AVAILABLE", "The V3 name is unavailable or reserved at the guarded quote block.");
  }
  if (
    preparedCommit.plan.expectedSender !== payer
    || preparedCommit.plan.to !== getAddress(manifest.contracts.controller.address!)
    || preparedCommit.plan.functionName !== "commit"
    || preparedCommit.scope.normalizationTypedDataDigest !== attestation.typedDataDigest
    || preparedCommit.scope.normalizationAttestationHash !== attestation.controllerAttestationHash
  ) {
    throw new X402RegistrationError(503, "V3_QUOTE_PLAN_MISMATCH", "The prepared V3 commitment does not match the managed payer and attestation scope.");
  }
  const issuedAt = dependencies.nowSeconds;
  const expiresAt = issuedAt + dependencies.ttlSeconds;
  if (
    !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || dependencies.ttlSeconds < 1
    || BigInt(attestation.claims.validUntil) < BigInt(expiresAt)
  ) {
    throw new X402RegistrationError(503, "PAID_QUOTE_WINDOW_INVALID", "The paid quote lifetime is outside the attestation validity window.");
  }
  const unsignedQuote = createUnsignedV3RegistrationQuote({
    chainId: manifest.chainId,
    description: `Register ${normalized.normalizedFullName}`,
    asset: getAddress(manifest.settlement.tokenAddress!),
    amountBaseUnits: preparedCommit.scope.expectedAmount.toString(),
    payTo: payer,
    issuedAt: issuedAt.toString(),
    expiresAt: expiresAt.toString(),
    paymentTimeoutSeconds: dependencies.ttlSeconds,
    normalizationTypedDataDigest: attestation.typedDataDigest,
    controllerAttestationHash: attestation.controllerAttestationHash,
    normalizationValidUntil: attestation.claims.validUntil,
  });
  const initialization = {
    addressRecord: getAddress(input.initialization.addressRecord),
    textKeys: (input.initialization.textRecords ?? []).map((record) => record.key),
    textValues: (input.initialization.textRecords ?? []).map((record) => record.value),
  };
  const registerCalldata = encodeFunctionData({
    abi: chainNameControllerV3Abi,
    functionName: "register",
    args: [{
      label: preparedCommit.scope.label,
      recipient: preparedCommit.scope.recipient,
      durationYears: preparedCommit.scope.durationYears,
      referrer: preparedCommit.scope.referrer ?? zeroAddress,
      secret,
      resolverInitializationHash: preparedCommit.scope.resolverInitializationHash,
      normalizationAttestationHash: preparedCommit.scope.normalizationAttestationHash,
      expectedAmount: preparedCommit.scope.expectedAmount,
      expectedReferralRewardBps: preparedCommit.scope.expectedReferralRewardBps,
    }, initialization, {
      validUntil: BigInt(attestation.claims.validUntil),
      signature: attestation.signature,
    }],
  });
  const plan = await buildRegistrationExecutionPlan({
    value: {
      schema: "sepbase.x402.registration-plan.v1",
      quoteId: unsignedQuote.quoteId,
      chainId: manifest.chainId,
      network: `eip155:${manifest.chainId}`,
      normalizationAttestation: attestation,
      steps: [{
        kind: "commit",
        target: preparedCommit.plan.to,
        selector: preparedCommit.plan.data.slice(0, 10) as Hex,
        calldata: preparedCommit.plan.data,
        valueBaseUnits: preparedCommit.plan.value.toString(),
      }, {
        kind: "reveal",
        target: preparedCommit.plan.to,
        selector: registerCalldata.slice(0, 10) as Hex,
        calldata: registerCalldata,
        valueBaseUnits: "0",
      }],
      revealWindow: {
        clock: "timestamp",
        minimumAge: manifest.commitment.minAgeSeconds,
        maximumAge: manifest.commitment.maxAgeSeconds,
      },
    },
    policy: v3RegistrationExecutionPolicy(manifest),
    nowSeconds: dependencies.nowSeconds,
  });
  const signedQuote = signV3RegistrationQuote({
    quote: unsignedQuote,
    planId: plan.planId,
    authenticator: configured.runtime.quoteAuthenticator,
  });
  await configured.runtime.planAdapter.validateBundle({
    intent: {
      quoteId: signedQuote.quoteId,
      planId: signedQuote.planId,
      chainId: signedQuote.chainId,
      network: signedQuote.network,
      resourcePath: signedQuote.resourcePath,
      description: signedQuote.description,
      asset: signedQuote.asset,
      amountBaseUnits: signedQuote.amountBaseUnits,
      payTo: signedQuote.payTo,
      issuedAt: signedQuote.issuedAt,
      expiresAt: signedQuote.expiresAt,
      paymentTimeoutSeconds: signedQuote.paymentTimeoutSeconds,
      normalizationTypedDataDigest: signedQuote.normalizationTypedDataDigest,
      controllerAttestationHash: signedQuote.controllerAttestationHash,
      normalizationValidUntil: signedQuote.normalizationValidUntil,
    },
    plan,
  });
  const persisted = await configured.runtime.store.persistPreparedPlan({
    quoteId: signedQuote.quoteId,
    planId: signedQuote.planId,
    signedQuote,
    executionPlan: plan,
    expiresAt: signedQuote.expiresAt,
  });
  if (persisted.outcome === "conflict") {
    throw new X402RegistrationError(409, "PREPARED_PLAN_CONFLICT", "Another encrypted plan is already bound to this quote.");
  }
  return {
    signedQuote,
    quoteId: signedQuote.quoteId,
    planId: signedQuote.planId,
    expiresAt: signedQuote.expiresAt,
  };
}
