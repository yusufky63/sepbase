import {
  hashV3NormalizationAttestation,
  normalizeName,
  type NormalizedName,
  type SepbaseV3Client,
  type V3RegistrationScope,
  type V3ResolverInitialization,
  type V3TransactionPlan,
} from "@sepbase/sdk";
import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";
import {
  V3_REGISTRATION_SESSION_MAX_ENTRIES,
  V3_REGISTRATION_SESSION_SECRET_WARNING,
  exportV3RegistrationJournal,
  exportV3RegistrationSession,
  generateV3RegistrationSecret,
  loadV3RegistrationJournals,
  loadV3RegistrationSessions,
  pruneV3RegistrationRecovery,
  removeV3RegistrationJournal,
  removeV3RegistrationSession,
  storeV3RegistrationJournal,
  storeV3RegistrationSession,
  type V3RegistrationJournal,
  type V3RegistrationSession,
  type V3RegistrationSessionStorage,
} from "./v3-registration-session";
import {
  executeV3Plan,
  type V3PlanExecutionAdapter,
} from "./v3-plan-executor";

const ATTESTATION_ENDPOINT = "/api/v3/normalization-attestation";
const ATTESTATION_COMMIT_SAFETY_SECONDS = 30n;
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value): Hex => value.toLowerCase() as Hex);
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value): Hex => value.toLowerCase() as Hex);
const address = z.string().refine(isAddress).transform((value): Address => getAddress(value));
const attestationResponseSchema = z.object({
  data: z.object({
    schemaVersion: z.literal(1),
    suiteReleaseId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    chainId: z.number().int().positive(),
    controller: address,
    normalizationProfileId: z.string().min(1),
    normalizationProfileHash: bytes32,
    normalizedLabel: z.string().min(1),
    normalizedFullName: z.string().min(1),
    labelHash: bytes32,
    recipient: address,
    attestor: address,
    validUntil: z.string().regex(/^(0|[1-9][0-9]*)$/),
    signature,
    typedDataDigest: bytes32,
    controllerAttestationHash: bytes32,
  }).strict(),
}).strict();

export type V3RegistrationManifest = {
  releaseStatus: "draft" | "candidate" | "live";
  suiteReleaseId: `sha256:${string}`;
  chainId: number;
  suffix: string;
  requiredConfirmations: number;
  nameRules: { minCodepoints: number; maxCodepoints: number; maxUtf8Bytes: number };
  normalization: {
    profileId: string;
    profileHash: Hex;
    attestor: Address | null;
  };
  contracts: { controller: { address: Address | null } };
  commitment: { minAgeSeconds: string; maxAgeSeconds: string };
  settlement: {
    kind: "native" | "erc20";
    tokenAddress: Address | null;
    decimals: number;
    symbol: string;
  };
};

export type V3RegistrationFlowClient = SepbaseV3Client;

export type V3RegistrationTransactionAdapter = V3PlanExecutionAdapter & {
  getWalletContext(): Promise<{ account: Address | null; chainId: number | null }>;
  getChainTimestamp(): Promise<bigint>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
  getRegistrationCommitmentState(input: {
    controller: Address;
    commitment: Hex;
  }): Promise<{
    committedAt: bigint;
    consumed: boolean;
    blockNumber: bigint;
    blockTimestamp: bigint;
  }>;
};

export type V3RegistrationDraft = {
  rawInput: string;
  payer: Address;
  recipient: Address;
  durationYears: 1 | 2 | 3 | 4 | 5;
  referrer?: Address | null;
  initialization: V3ResolverInitialization;
};

export type V3IssuedAttestation = z.output<typeof attestationResponseSchema>["data"];

export type V3RevealReadiness = {
  kind: "too-early" | "ready" | "expired";
  now: bigint;
  earliestRevealAt: bigint;
  latestRevealAt: bigint;
  secondsRemaining: bigint;
};

export type V3RegistrationStage =
  | "idle"
  | "review"
  | "attestation-required"
  | "attestation-ready"
  | "committing"
  | "too-early"
  | "ready"
  | "expired"
  | "revealing"
  | "complete"
  | "restart-required";

export type V3RegistrationFlowState = {
  stage: V3RegistrationStage;
  draft: V3RegistrationDraft | null;
  normalized: NormalizedName | null;
  canonicalConfirmed: boolean;
  attestation: V3IssuedAttestation | null;
  journal: V3RegistrationJournal | null;
  session: V3RegistrationSession | null;
  readiness: V3RevealReadiness | null;
  transactionHash: Hash | null;
  error: { code: string; message: string } | null;
};

export class V3RegistrationFlowError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "V3RegistrationFlowError";
  }
}

type FlowOptions = {
  client: V3RegistrationFlowClient;
  transactions: V3RegistrationTransactionAdapter;
  storage?: V3RegistrationSessionStorage | null;
  fetcher?: typeof fetch;
  origin?: () => string;
  randomSource?: Pick<Crypto, "getRandomValues">;
};

function runtimeController(manifest: V3RegistrationManifest) {
  if (
    manifest.releaseStatus === "draft"
    || !manifest.contracts.controller.address
    || !manifest.normalization.attestor
  ) throw new V3RegistrationFlowError("V3_NOT_DEPLOYED", "V3 registration is unavailable until a candidate/live suite is verified.");
  return getAddress(manifest.contracts.controller.address);
}

function walletRejected(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === 4_001 || candidate.code === "ACTION_REJECTED" || candidate.name === "UserRejectedRequestError";
}

function sameAddress(left: string, right: string) {
  return getAddress(left) === getAddress(right);
}

type V3RegistrationMaterial = V3RegistrationSession | V3RegistrationJournal;

function sessionScope(session: V3RegistrationMaterial): V3RegistrationScope {
  return {
    suiteReleaseId: session.suiteReleaseId as `sha256:${string}`,
    chainId: session.chainId,
    controller: session.controller,
    preparedAtBlock: BigInt(session.preparedAtBlock),
    label: session.label,
    node: session.node,
    payer: session.payer,
    recipient: session.recipient,
    durationYears: session.durationYears,
    referrer: session.referrer,
    expectedAmount: BigInt(session.expectedAmount),
    expectedReferralRewardBps: session.expectedReferralRewardBps,
    resolverInitializationHash: session.resolverInitializationHash,
    normalizationAttestationHash: session.normalizationAttestationHash,
    normalizationTypedDataDigest: session.normalizationTypedDataDigest,
    commitment: session.commitment,
  };
}

function sessionInitialization(session: V3RegistrationMaterial): V3ResolverInitialization {
  return {
    addressRecord: session.resolverInitialization.addressRecord,
    textRecords: session.resolverInitialization.textRecords,
  };
}

function journalToSession(
  journal: V3RegistrationJournal,
  manifest: V3RegistrationManifest,
  committedAt: bigint,
): V3RegistrationSession {
  const { submittedTransactionHash, ...material } = journal;
  return {
    ...material,
    commit: {
      transactionHash: submittedTransactionHash,
      confirmedAt: committedAt.toString(),
      earliestRevealAt: (committedAt + BigInt(manifest.commitment.minAgeSeconds)).toString(),
      latestRevealAt: (committedAt + BigInt(manifest.commitment.maxAgeSeconds)).toString(),
    },
  };
}

function restoredDraft(material: V3RegistrationMaterial): V3RegistrationDraft {
  return {
    rawInput: material.label,
    payer: material.payer,
    recipient: material.recipient,
    durationYears: material.durationYears,
    ...(material.referrer !== zeroAddress ? { referrer: material.referrer } : {}),
    initialization: sessionInitialization(material),
  };
}

function restoredAttestation(
  manifest: V3RegistrationManifest,
  material: V3RegistrationMaterial,
  normalized: NormalizedName,
): V3IssuedAttestation {
  return {
    schemaVersion: 1,
    suiteReleaseId: material.suiteReleaseId,
    chainId: material.chainId,
    controller: material.controller,
    normalizationProfileId: manifest.normalization.profileId,
    normalizationProfileHash: manifest.normalization.profileHash,
    normalizedLabel: material.label,
    normalizedFullName: normalized.normalizedFullName,
    labelHash: normalized.labelHash,
    recipient: material.recipient,
    attestor: manifest.normalization.attestor!,
    validUntil: material.attestation.validUntil,
    signature: material.attestation.signature,
    typedDataDigest: material.normalizationTypedDataDigest,
    controllerAttestationHash: material.normalizationAttestationHash,
  };
}

export function getV3RevealReadiness(session: V3RegistrationSession, now: bigint): V3RevealReadiness {
  const earliestRevealAt = BigInt(session.commit.earliestRevealAt);
  const commitmentLatest = BigInt(session.commit.latestRevealAt);
  const attestationLatest = BigInt(session.attestation.validUntil);
  const latestRevealAt = commitmentLatest < attestationLatest ? commitmentLatest : attestationLatest;
  if (now < earliestRevealAt) {
    return { kind: "too-early", now, earliestRevealAt, latestRevealAt, secondsRemaining: earliestRevealAt - now };
  }
  if (now > latestRevealAt) {
    return { kind: "expired", now, earliestRevealAt, latestRevealAt, secondsRemaining: 0n };
  }
  return { kind: "ready", now, earliestRevealAt, latestRevealAt, secondsRemaining: latestRevealAt - now };
}

function safeOrigin(origin: string) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password) {
    throw new V3RegistrationFlowError("INVALID_SITE_ORIGIN", "A canonical site origin is required.");
  }
  return parsed.origin;
}

export async function requestV3RegistrationAttestation(input: {
  manifest: V3RegistrationManifest;
  rawInput: string;
  normalized: NormalizedName;
  canonicalConfirmed: boolean;
  recipient: Address;
  origin: string;
  fetcher?: typeof fetch;
}) {
  const controller = runtimeController(input.manifest);
  const attestor = getAddress(input.manifest.normalization.attestor!);
  const origin = safeOrigin(input.origin);
  const changed = input.rawInput.trim() !== input.normalized.normalizedLabel;
  if (changed && !input.canonicalConfirmed) {
    throw new V3RegistrationFlowError("CANONICAL_CONFIRMATION_REQUIRED", "Confirm the exact canonical label before attestation.");
  }
  const endpoint = new URL(ATTESTATION_ENDPOINT, origin);
  if (endpoint.origin !== origin || endpoint.hash || endpoint.search) {
    throw new V3RegistrationFlowError("INVALID_ATTESTATION_ENDPOINT", "Attestation must use the fixed same-origin endpoint.");
  }
  const response = await (input.fetcher ?? fetch)(endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      suiteReleaseId: input.manifest.suiteReleaseId,
      chainId: input.manifest.chainId,
      controller,
      normalizationProfileId: input.manifest.normalization.profileId,
      normalizationProfileHash: input.manifest.normalization.profileHash,
      attestor,
      recipient: getAddress(input.recipient),
      rawInput: input.rawInput,
      ...(changed ? { canonicalLabel: input.normalized.normalizedLabel } : {}),
    }),
  });
  if (!response.ok) {
    const code = response.status === 409 ? "ATTESTATION_REVIEW_REQUIRED" : "ATTESTATION_UNAVAILABLE";
    throw new V3RegistrationFlowError(code, "The normalization attestation request failed closed.");
  }
  let issued: V3IssuedAttestation;
  try {
    issued = attestationResponseSchema.parse(await response.json()).data;
  } catch {
    throw new V3RegistrationFlowError("INVALID_ATTESTATION_RESPONSE", "The attestation response is invalid.");
  }
  if (
    issued.suiteReleaseId !== input.manifest.suiteReleaseId
    || issued.chainId !== input.manifest.chainId
    || !sameAddress(issued.controller, controller)
    || issued.normalizationProfileId !== input.manifest.normalization.profileId
    || issued.normalizationProfileHash !== input.manifest.normalization.profileHash.toLowerCase()
    || issued.normalizedLabel !== input.normalized.normalizedLabel
    || issued.normalizedFullName !== input.normalized.normalizedFullName
    || issued.labelHash !== input.normalized.labelHash
    || !sameAddress(issued.recipient, input.recipient)
    || !sameAddress(issued.attestor, attestor)
    || hashV3NormalizationAttestation({ validUntil: BigInt(issued.validUntil), signature: issued.signature }) !== issued.controllerAttestationHash
  ) throw new V3RegistrationFlowError("ATTESTATION_SCOPE_MISMATCH", "The attestation response belongs to another exact release scope.");
  return issued;
}

function assertPlan(
  client: V3RegistrationFlowClient,
  plan: V3TransactionPlan,
  payer: Address,
  expectedAmount: bigint | null,
) {
  const manifest = client.manifest;
  const controller = runtimeController(manifest);
  client.assertTransactionPlan(plan);
  if (
    plan.suiteReleaseId !== manifest.suiteReleaseId
    || plan.chainId !== manifest.chainId
    || !sameAddress(plan.expectedSender, payer)
    || !sameAddress(plan.to, controller)
  ) throw new V3RegistrationFlowError("TRANSACTION_SCOPE_MISMATCH", "Unsigned transaction plan belongs to another release scope.");
  if (expectedAmount === null) {
    if (plan.value !== 0n || plan.settlementApproval !== null) {
      throw new V3RegistrationFlowError("SETTLEMENT_GUARD_MISMATCH", "Commit must not transfer or approve settlement assets.");
    }
    return;
  }
  if (manifest.settlement.kind === "native") {
    if (plan.value !== expectedAmount || plan.settlementApproval !== null) {
      throw new V3RegistrationFlowError("SETTLEMENT_GUARD_MISMATCH", "Native settlement plan does not match the exact quote.");
    }
  } else {
    const token = manifest.settlement.tokenAddress;
    if (
      !token
      || plan.value !== 0n
      || !plan.settlementApproval
      || !sameAddress(plan.settlementApproval.token, token)
      || !sameAddress(plan.settlementApproval.spender, controller)
      || plan.settlementApproval.amount !== expectedAmount
    ) throw new V3RegistrationFlowError("SETTLEMENT_GUARD_MISMATCH", "ERC-20 settlement plan does not match the exact asset and quote.");
  }
}

function assertIssuedAttestationScope(
  manifest: V3RegistrationManifest,
  draft: V3RegistrationDraft,
  normalized: NormalizedName,
  issued: V3IssuedAttestation,
) {
  const controller = runtimeController(manifest);
  const attestor = getAddress(manifest.normalization.attestor!);
  if (
    issued.suiteReleaseId !== manifest.suiteReleaseId
    || issued.chainId !== manifest.chainId
    || !sameAddress(issued.controller, controller)
    || issued.normalizationProfileId !== manifest.normalization.profileId
    || issued.normalizationProfileHash !== manifest.normalization.profileHash.toLowerCase()
    || issued.normalizedLabel !== normalized.normalizedLabel
    || issued.normalizedFullName !== normalized.normalizedFullName
    || issued.labelHash !== normalized.labelHash
    || !sameAddress(issued.recipient, draft.recipient)
    || !sameAddress(issued.attestor, attestor)
    || hashV3NormalizationAttestation({ validUntil: BigInt(issued.validUntil), signature: issued.signature }) !== issued.controllerAttestationHash
  ) throw new V3RegistrationFlowError("ATTESTATION_SCOPE_MISMATCH", "The attestation does not match the exact reviewed release scope.");
}

export class V3RegistrationFlowController {
  private state: V3RegistrationFlowState = {
    stage: "idle",
    draft: null,
    normalized: null,
    canonicalConfirmed: false,
    attestation: null,
    journal: null,
    session: null,
    readiness: null,
    transactionHash: null,
    error: null,
  };

  private readonly listeners = new Set<() => void>();
  private inFlight: "attestation" | "commit" | "reveal" | "restore" | null = null;
  private timeRefreshInFlight = false;

  constructor(private readonly options: FlowOptions) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<V3RegistrationFlowState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private assertOperationAvailable(allowed: typeof this.inFlight = null) {
    if (this.inFlight && this.inFlight !== allowed) {
      throw new V3RegistrationFlowError(
        "OPERATION_IN_PROGRESS",
        `A ${this.inFlight} operation is already in progress. Wait for it to settle before retrying.`,
      );
    }
  }

  private beginOperation(operation: Exclude<typeof this.inFlight, null>) {
    this.assertOperationAvailable();
    this.inFlight = operation;
  }

  private endOperation(operation: Exclude<typeof this.inFlight, null>) {
    if (this.inFlight === operation) this.inFlight = null;
  }

  private fail(error: unknown, fallbackCode: string, fallbackMessage: string, stage?: V3RegistrationStage) {
    const mapped = error instanceof V3RegistrationFlowError
      ? error
      : walletRejected(error)
        ? new V3RegistrationFlowError("WALLET_REJECTED", "The wallet request was rejected; no completion is claimed.")
        : new V3RegistrationFlowError(fallbackCode, fallbackMessage);
    this.update({ ...(stage ? { stage } : {}), error: { code: mapped.code, message: mapped.message } });
    return mapped;
  }

  review(draft: V3RegistrationDraft) {
    this.assertOperationAvailable();
    try {
      const normalized = this.options.client.normalize(draft.rawInput);
      const canonicalConfirmed = draft.rawInput.trim() === normalized.normalizedLabel;
      this.update({
        stage: canonicalConfirmed ? "attestation-required" : "review",
        draft: { ...draft, payer: getAddress(draft.payer), recipient: getAddress(draft.recipient) },
        normalized,
        canonicalConfirmed,
        attestation: null,
        journal: null,
        session: null,
        readiness: null,
        transactionHash: null,
        error: null,
      });
      return normalized;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "NORMALIZATION_FAILED";
      throw this.fail(
        new V3RegistrationFlowError(code, error instanceof Error ? error.message : "ENSIP-15 normalization failed."),
        "NORMALIZATION_FAILED",
        "ENSIP-15 normalization failed.",
        "idle",
      );
    }
  }

  confirmCanonical(label: string) {
    this.assertOperationAvailable();
    if (!this.state.normalized || label !== this.state.normalized.normalizedLabel) {
      throw this.fail(new V3RegistrationFlowError("CANONICAL_CONFIRMATION_MISMATCH", "Canonical confirmation must match exactly."), "CANONICAL_CONFIRMATION_MISMATCH", "Canonical confirmation failed.", "review");
    }
    this.update({ stage: "attestation-required", canonicalConfirmed: true, error: null });
  }

  async requestAttestation() {
    this.beginOperation("attestation");
    try {
      runtimeController(this.options.client.manifest);
      const { draft, normalized, canonicalConfirmed } = this.state;
      if (!draft || !normalized || !canonicalConfirmed) {
        throw new V3RegistrationFlowError("REVIEW_INCOMPLETE", "Canonical review must be completed first.");
      }
      const issued = await requestV3RegistrationAttestation({
        manifest: this.options.client.manifest,
        rawInput: draft.rawInput,
        normalized,
        canonicalConfirmed,
        recipient: draft.recipient,
        origin: (this.options.origin ?? (() => window.location.origin))(),
        ...(this.options.fetcher ? { fetcher: this.options.fetcher } : {}),
      });
      this.acceptAttestation(issued);
      return issued;
    } catch (error) {
      throw this.fail(error, "ATTESTATION_UNAVAILABLE", "Attestation request failed closed.", this.state.stage);
    } finally {
      this.endOperation("attestation");
    }
  }

  acceptAttestation(issued: V3IssuedAttestation) {
    this.assertOperationAvailable("attestation");
    if (!this.state.draft || !this.state.normalized || !this.state.canonicalConfirmed) {
      throw this.fail(
        new V3RegistrationFlowError("REVIEW_INCOMPLETE", "Canonical review must be completed before accepting an attestation."),
        "REVIEW_INCOMPLETE",
        "Canonical review is incomplete.",
      );
    }
    try {
      assertIssuedAttestationScope(
        this.options.client.manifest,
        this.state.draft,
        this.state.normalized,
        issued,
      );
    } catch (error) {
      throw this.fail(error, "ATTESTATION_SCOPE_MISMATCH", "Attestation scope validation failed.", this.state.stage);
    }
    if (this.state.session && issued.controllerAttestationHash !== this.state.session.normalizationAttestationHash) {
      throw this.fail(
        new V3RegistrationFlowError("ATTESTATION_REPLACEMENT_REQUIRES_NEW_COMMIT", "A replacement attestation changes the commitment and requires a new commit."),
        "ATTESTATION_REPLACEMENT_REQUIRES_NEW_COMMIT",
        "A new commit is required.",
        "restart-required",
      );
    }
    this.update({ stage: "attestation-ready", attestation: issued, error: null });
  }

  private async assertWallet(payer: Address) {
    const context = await this.options.transactions.getWalletContext();
    if (context.chainId !== this.options.client.manifest.chainId) {
      throw new V3RegistrationFlowError("WRONG_NETWORK", `Switch to chain ${this.options.client.manifest.chainId} before continuing.`);
    }
    if (!context.account || !sameAddress(context.account, payer)) {
      throw new V3RegistrationFlowError("WRONG_ACCOUNT", "The connected wallet must match the committed payer.");
    }
  }

  async commit() {
    this.beginOperation("commit");
    let pendingJournal: V3RegistrationJournal | null = null;
    let walletSubmissionStarted = false;
    try {
      const manifest = this.options.client.manifest;
      const controller = runtimeController(manifest);
      const { draft, normalized, canonicalConfirmed, attestation } = this.state;
      if (!draft || !normalized || !canonicalConfirmed || !attestation) {
        throw new V3RegistrationFlowError("ATTESTATION_REQUIRED", "Canonical review and attestation are required before commit.");
      }
      await this.assertWallet(draft.payer);
      const chainNow = await this.options.transactions.getChainTimestamp();
      pruneV3RegistrationRecovery(this.options.storage ?? null, chainNow);
      const stored = loadV3RegistrationSessions(this.options.storage);
      const journals = loadV3RegistrationJournals(this.options.storage);
      if (!stored.ok || !journals.ok || stored.storageState !== "available") {
        throw new V3RegistrationFlowError("SESSION_STORAGE_UNAVAILABLE", "Device-local recovery storage must be writable before commit.");
      }
      if (stored.sessions.length + journals.journals.length >= V3_REGISTRATION_SESSION_MAX_ENTRIES) {
        throw new V3RegistrationFlowError("SESSION_STORAGE_FULL", "Export or clear an existing pending commitment before creating another.");
      }
      const minAge = BigInt(manifest.commitment.minAgeSeconds);
      if (BigInt(attestation.validUntil) < chainNow + minAge + ATTESTATION_COMMIT_SAFETY_SECONDS) {
        throw new V3RegistrationFlowError("ATTESTATION_WINDOW_TOO_SHORT", "Request a fresh attestation before committing.");
      }
      const secret = generateV3RegistrationSecret(this.options.randomSource);
      const prepared = await this.options.client.prepareRegistrationCommit({
        label: normalized.normalizedLabel,
        payer: draft.payer,
        recipient: draft.recipient,
        durationYears: draft.durationYears,
        ...(draft.referrer !== undefined ? { referrer: draft.referrer } : {}),
        secret,
        initialization: draft.initialization,
        attestation: { validUntil: BigInt(attestation.validUntil), signature: attestation.signature },
      });
      if (
        prepared.scope.suiteReleaseId !== manifest.suiteReleaseId
        || prepared.scope.chainId !== manifest.chainId
        || !sameAddress(prepared.scope.controller, controller)
        || !sameAddress(prepared.scope.payer, draft.payer)
        || prepared.scope.normalizationAttestationHash !== attestation.controllerAttestationHash
      ) throw new V3RegistrationFlowError("COMMITMENT_SCOPE_MISMATCH", "Prepared commitment does not match the exact reviewed scope.");
      assertPlan(this.options.client, prepared.plan, draft.payer, null);
      const journal: V3RegistrationJournal = {
        schemaVersion: 1,
        suiteReleaseId: prepared.scope.suiteReleaseId,
        chainId: prepared.scope.chainId,
        controller: prepared.scope.controller,
        preparedAtBlock: prepared.scope.preparedAtBlock.toString(),
        suffix: manifest.suffix,
        label: prepared.scope.label,
        node: prepared.scope.node,
        payer: prepared.scope.payer,
        recipient: prepared.scope.recipient,
        durationYears: prepared.scope.durationYears,
        referrer: prepared.scope.referrer,
        expectedAmount: prepared.scope.expectedAmount.toString(),
        expectedReferralRewardBps: prepared.scope.expectedReferralRewardBps,
        resolverInitializationHash: prepared.scope.resolverInitializationHash,
        resolverInitialization: {
          addressRecord: getAddress(draft.initialization.addressRecord),
          textRecords: [...(draft.initialization.textRecords ?? [])],
        },
        normalizationAttestationHash: prepared.scope.normalizationAttestationHash,
        normalizationTypedDataDigest: prepared.scope.normalizationTypedDataDigest,
        commitment: prepared.scope.commitment,
        secret,
        attestation: { validUntil: attestation.validUntil, signature: attestation.signature },
        submittedTransactionHash: null,
      };
      const journalWrite = storeV3RegistrationJournal(journal, this.options.storage);
      if (!journalWrite.ok) {
        throw new V3RegistrationFlowError(
          "SESSION_PERSISTENCE_FAILED",
          "The exact commitment secret could not be durably journaled; no wallet transaction was requested.",
        );
      }
      pendingJournal = journalWrite.journal;
      this.update({ stage: "committing", journal: pendingJournal, error: null });
      await this.assertWallet(draft.payer);
      const execution = await executeV3Plan({
        client: this.options.client,
        adapter: this.options.transactions,
        prepare: async () => prepared.plan,
        onStage: (stage) => {
          if (stage === "signing") walletSubmissionStarted = true;
        },
        onSubmitted: (hash) => {
          const journalWithHash = { ...pendingJournal!, submittedTransactionHash: hash };
          const submittedWrite = storeV3RegistrationJournal(journalWithHash, this.options.storage);
          if (!submittedWrite.ok) {
            throw new V3RegistrationFlowError(
              "SESSION_SUBMISSION_PERSISTENCE_FAILED",
              "The commitment was submitted, but its transaction hash could not be stored. Keep this page open or restore from the pre-submit journal.",
            );
          }
          pendingJournal = submittedWrite.journal;
          this.update({ journal: pendingJournal, transactionHash: hash });
        },
      });
      const transactionHash = execution.hash;
      const confirmedAt = await this.options.transactions.getBlockTimestamp(execution.blockNumber);
      const session = journalToSession(pendingJournal, manifest, confirmedAt);
      const persisted = storeV3RegistrationSession(session, this.options.storage);
      if (!persisted.ok) {
        this.update({ session, journal: pendingJournal, transactionHash, stage: "restart-required" });
        throw new V3RegistrationFlowError("SESSION_PERSISTENCE_FAILED", "Commit confirmed, but recovery persistence failed. Export the session before leaving this page.");
      }
      removeV3RegistrationJournal(pendingJournal, this.options.storage);
      let confirmedChainNow = confirmedAt;
      try {
        const latestChainNow = await this.options.transactions.getChainTimestamp();
        if (latestChainNow > confirmedChainNow) confirmedChainNow = latestChainNow;
      } catch {
        // The receipt block timestamp is already a trusted confirmed-chain lower bound.
      }
      const readiness = getV3RevealReadiness(session, confirmedChainNow);
      this.update({
        stage: readiness.kind,
        journal: null,
        session,
        readiness,
        transactionHash,
        error: null,
      });
      return session;
    } catch (error) {
      const rejected = walletRejected(error);
      if (pendingJournal && (rejected || !walletSubmissionStarted)) {
        removeV3RegistrationJournal(pendingJournal, this.options.storage);
        pendingJournal = null;
        this.update({ journal: null, transactionHash: null });
      }
      const stage = this.state.session || pendingJournal ? "restart-required" : "attestation-ready";
      throw this.fail(error, "COMMIT_FAILED", "Commit was not confirmed.", stage);
    } finally {
      this.endOperation("commit");
    }
  }

  async restore(payer: Address) {
    this.beginOperation("restore");
    try {
      const manifest = this.options.client.manifest;
      const controller = runtimeController(manifest);
      const chainNow = await this.options.transactions.getChainTimestamp();
      pruneV3RegistrationRecovery(this.options.storage ?? null, chainNow);
      const loaded = loadV3RegistrationSessions(this.options.storage);
      const loadedJournals = loadV3RegistrationJournals(this.options.storage);
      if (!loaded.ok || !loadedJournals.ok) {
        throw new V3RegistrationFlowError("SESSION_STORAGE_UNAVAILABLE", "Pending commitment recovery is unavailable.");
      }
      const sessions = loaded.sessions.filter((session) => (
        session.suiteReleaseId === manifest.suiteReleaseId
        && session.chainId === manifest.chainId
        && sameAddress(session.controller, controller)
        && sameAddress(session.payer, payer)
      ));
      const journals = loadedJournals.journals.filter((journal) => (
        journal.suiteReleaseId === manifest.suiteReleaseId
        && journal.chainId === manifest.chainId
        && sameAddress(journal.controller, controller)
        && sameAddress(journal.payer, payer)
      ));
      let observedChainNow = chainNow;
      let pendingJournal: V3RegistrationJournal | null = null;
      let completedJournal: V3RegistrationJournal | null = null;

      for (const journal of journals) {
        if (sessions.some((session) => session.commitment === journal.commitment)) {
          removeV3RegistrationJournal(journal, this.options.storage);
          continue;
        }
        const commitmentState = await this.options.transactions.getRegistrationCommitmentState({
          controller,
          commitment: journal.commitment,
        });
        if (commitmentState.blockTimestamp > observedChainNow) observedChainNow = commitmentState.blockTimestamp;
        if (commitmentState.consumed) {
          const record = await this.options.client.getNameRecord(journal.label, commitmentState.blockNumber);
          if (
            record.status === "active"
            && !record.available
            && record.owner
            && sameAddress(record.owner, journal.recipient)
          ) {
            removeV3RegistrationJournal(journal, this.options.storage);
            completedJournal = journal;
            continue;
          }
          pendingJournal ??= journal;
          continue;
        }
        if (commitmentState.committedAt === 0n) {
          pendingJournal ??= journal;
          continue;
        }
        const recovered = journalToSession(journal, manifest, commitmentState.committedAt);
        const persisted = storeV3RegistrationSession(recovered, this.options.storage);
        if (!persisted.ok) {
          pendingJournal ??= journal;
          continue;
        }
        removeV3RegistrationJournal(journal, this.options.storage);
        sessions.push(persisted.session);
      }

      const session = sessions.sort((left, right) => {
        const leftConfirmedAt = BigInt(left.commit.confirmedAt);
        const rightConfirmedAt = BigInt(right.commit.confirmedAt);
        return leftConfirmedAt === rightConfirmedAt ? 0 : leftConfirmedAt > rightConfirmedAt ? -1 : 1;
      })[0];
      if (!session) {
        if (completedJournal) {
          this.update({
            stage: "complete",
            draft: restoredDraft(completedJournal),
            normalized: this.options.client.normalize(completedJournal.label),
            canonicalConfirmed: true,
            attestation: null,
            journal: null,
            session: null,
            readiness: null,
            transactionHash: null,
            error: null,
          });
          return null;
        }
        if (pendingJournal) {
          const normalized = this.options.client.normalize(pendingJournal.label);
          this.update({
            stage: "restart-required",
            draft: restoredDraft(pendingJournal),
            normalized,
            canonicalConfirmed: true,
            attestation: restoredAttestation(manifest, pendingJournal, normalized),
            journal: pendingJournal,
            session: null,
            readiness: null,
            transactionHash: pendingJournal.submittedTransactionHash,
            error: {
              code: "COMMITMENT_RECONCILIATION_PENDING",
              message: "The pre-submit journal is safe, but this confirmed chain block does not yet expose a revealable commitment. Retry recovery after the wallet transaction settles.",
            },
          });
        }
        return null;
      }
      const readiness = getV3RevealReadiness(session, observedChainNow);
      const normalized = this.options.client.normalize(session.label);
      this.update({
        stage: readiness.kind,
        draft: restoredDraft(session),
        normalized,
        canonicalConfirmed: true,
        attestation: restoredAttestation(manifest, session, normalized),
        journal: null,
        session,
        readiness,
        transactionHash: session.commit.transactionHash,
        error: null,
      });
      return session;
    } catch (error) {
      throw this.fail(error, "RECOVERY_FAILED", "Pending commitment recovery failed.");
    } finally {
      this.endOperation("restore");
    }
  }

  async tick() {
    if (this.inFlight || this.timeRefreshInFlight) return this.state.readiness;
    const session = this.state.session;
    if (!session || this.state.stage === "complete") return this.state.readiness;
    this.timeRefreshInFlight = true;
    try {
      const chainNow = await this.options.transactions.getChainTimestamp();
      if (this.state.session?.commitment !== session.commitment) return this.state.readiness;
      const readiness = getV3RevealReadiness(session, chainNow);
      this.update({ stage: readiness.kind, readiness });
      return readiness;
    } finally {
      this.timeRefreshInFlight = false;
    }
  }

  async reveal() {
    this.beginOperation("reveal");
    const session = this.state.session;
    let latestReadiness = this.state.readiness;
    try {
      if (!session) throw new V3RegistrationFlowError("COMMITMENT_REQUIRED", "A confirmed commitment is required.");
      runtimeController(this.options.client.manifest);
      await this.assertWallet(session.payer);
      const chainNow = await this.options.transactions.getChainTimestamp();
      const readiness = getV3RevealReadiness(session, chainNow);
      latestReadiness = readiness;
      this.update({ stage: readiness.kind, readiness });
      if (readiness.kind === "too-early") throw new V3RegistrationFlowError("COMMITMENT_NOT_READY", "The commitment has not reached its earliest reveal time.");
      if (readiness.kind === "expired") throw new V3RegistrationFlowError("COMMITMENT_EXPIRED", "The commitment or its exact attestation has expired; create a new commit.");
      const prepareRevealPlan = async () => {
        const prepared = await this.options.client.prepareRegistrationReveal({
          scope: sessionScope(session),
          secret: session.secret,
          initialization: sessionInitialization(session),
          attestation: { validUntil: BigInt(session.attestation.validUntil), signature: session.attestation.signature },
        });
        if (
          prepared.earliestRevealAt !== BigInt(session.commit.earliestRevealAt)
          || prepared.latestRevealAt !== BigInt(session.commit.latestRevealAt)
        ) throw new V3RegistrationFlowError("COMMITMENT_WINDOW_CHANGED", "On-chain commitment timing no longer matches the confirmed session.");
        const record = await this.options.client.getNameRecord(session.label, prepared.plan.blockNumber);
        if (record.blockNumber !== prepared.plan.blockNumber || !record.available) {
          throw new V3RegistrationFlowError("NAME_NOT_AVAILABLE", "The name is not available at the guarded reveal block.");
        }
        assertPlan(this.options.client, prepared.plan, session.payer, BigInt(session.expectedAmount));
        return prepared.plan;
      };
      this.update({ stage: "revealing", error: null });
      await this.assertWallet(session.payer);
      const execution = await executeV3Plan({
        client: this.options.client,
        adapter: this.options.transactions,
        prepare: prepareRevealPlan,
      });
      const transactionHash = execution.hash;
      const postState = await this.options.client.getNameRecord(session.label);
      if (
        postState.status !== "active"
        || postState.available
        || !postState.owner
        || !sameAddress(postState.owner, session.recipient)
      ) throw new V3RegistrationFlowError(
        "POST_STATE_RECONCILIATION_FAILED",
        "Receipt confirmed, but owner/lifecycle post-state is not yet reconciled.",
      );
      removeV3RegistrationSession(session, this.options.storage);
      this.update({ stage: "complete", journal: null, transactionHash, readiness: null, error: null });
      return transactionHash;
    } catch (error) {
      const mapped = error instanceof V3RegistrationFlowError
        ? error
        : walletRejected(error)
          ? new V3RegistrationFlowError("WALLET_REJECTED", "The wallet request was rejected; the commitment remains pending.")
          : new V3RegistrationFlowError("REVEAL_FAILED", "Reveal did not complete; the confirmed commitment remains recoverable.");
      const readiness = session ? latestReadiness : null;
      this.update({
        stage: mapped.code === "COMMITMENT_EXPIRED"
          ? "expired"
          : mapped.code === "POST_STATE_RECONCILIATION_FAILED"
            ? "restart-required"
            : readiness?.kind ?? "idle",
        readiness,
        error: { code: mapped.code, message: mapped.message },
      });
      throw mapped;
    } finally {
      this.endOperation("reveal");
    }
  }

  exportPendingSession() {
    if (!this.state.session && !this.state.journal) {
      throw new V3RegistrationFlowError("COMMITMENT_REQUIRED", "There is no pending recovery material to export.");
    }
    return {
      warning: V3_REGISTRATION_SESSION_SECRET_WARNING,
      serialized: this.state.session
        ? exportV3RegistrationSession(this.state.session)
        : exportV3RegistrationJournal(this.state.journal),
    };
  }
}

export function createV3RegistrationFlowController(options: FlowOptions) {
  return new V3RegistrationFlowController(options);
}

export function normalizeV3RegistrationDraft(manifest: V3RegistrationManifest, rawInput: string) {
  return normalizeName(rawInput, manifest.suffix, {
    minCodePoints: manifest.nameRules.minCodepoints,
    maxCodePoints: manifest.nameRules.maxCodepoints,
    maxUtf8Bytes: manifest.nameRules.maxUtf8Bytes,
  });
}

export const V3_ZERO_REFERRER = zeroAddress;
