import { describe, expect, it, vi } from "vitest";
import {
  hashV3NormalizationAttestation,
  normalizeName,
  type SepbaseV3Client,
  type V3RegistrationScope,
  type V3TransactionPlan,
} from "@sepbase/sdk";
import type { Address, Hash, Hex } from "viem";
import {
  createV3RegistrationFlowController,
  requestV3RegistrationAttestation,
  type V3IssuedAttestation,
  type V3RegistrationManifest,
  type V3RegistrationTransactionAdapter,
} from "./v3-registration-flow";
import type { V3RegistrationSessionStorage } from "./v3-registration-session";

const payer = "0x1000000000000000000000000000000000000001" as Address;
const recipient = "0x2000000000000000000000000000000000000002" as Address;
const controller = "0x3000000000000000000000000000000000000003" as Address;
const attestor = "0x4000000000000000000000000000000000000004" as Address;
const token = "0x5000000000000000000000000000000000000005" as Address;
const commitHash = `0x${"66".repeat(32)}` as Hash;
const revealHash = `0x${"77".repeat(32)}` as Hash;
const signature = `0x${"11".repeat(64)}1b` as Hex;
const suiteReleaseId = `sha256:${"a".repeat(64)}` as const;
const profileHash = `0x${"bb".repeat(32)}` as Hex;
const typedDataDigest = `0x${"cc".repeat(32)}` as Hex;
const resolverInitializationHash = `0x${"dd".repeat(32)}` as Hex;
const commitment = `0x${"ee".repeat(32)}` as Hex;

class MemoryStorage implements V3RegistrationSessionStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function manifest(releaseStatus: V3RegistrationManifest["releaseStatus"] = "candidate"): V3RegistrationManifest {
  return {
    releaseStatus,
    suiteReleaseId,
    chainId: 84_532,
    suffix: "sepbase",
    requiredConfirmations: 2,
    nameRules: { minCodepoints: 1, maxCodepoints: 32, maxUtf8Bytes: 96 },
    normalization: {
      profileId: "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47",
      profileHash,
      attestor: releaseStatus === "draft" ? null : attestor,
    },
    contracts: { controller: { address: releaseStatus === "draft" ? null : controller } },
    commitment: { minAgeSeconds: "60", maxAgeSeconds: "1000" },
    settlement: { kind: "erc20", tokenAddress: token, decimals: 6, symbol: "USDC" },
  };
}

function issued(overrides: Partial<V3IssuedAttestation> = {}): V3IssuedAttestation {
  const normalized = normalizeName("alice", "sepbase", { maxUtf8Bytes: 96 });
  const validUntil = "1600";
  return {
    schemaVersion: 1,
    suiteReleaseId,
    chainId: 84_532,
    controller,
    normalizationProfileId: manifest().normalization.profileId,
    normalizationProfileHash: profileHash,
    normalizedLabel: normalized.normalizedLabel,
    normalizedFullName: normalized.normalizedFullName,
    labelHash: normalized.labelHash,
    recipient,
    attestor,
    validUntil,
    signature,
    typedDataDigest,
    controllerAttestationHash: hashV3NormalizationAttestation({ validUntil: BigInt(validUntil), signature }),
    ...overrides,
  };
}

function transactionPlan(functionName: "commit" | "register", blockNumber: bigint): V3TransactionPlan {
  const reveal = functionName === "register";
  return {
    suiteReleaseId,
    chainId: 84_532,
    expectedSender: payer,
    to: controller,
    data: (reveal ? "0xbbbb" : "0xaaaa") as Hex,
    value: 0n,
    functionName,
    blockNumber,
    settlementApproval: reveal ? {
      token,
      spender: controller,
      amount: 500n,
      data: "0xcccc" as Hex,
    } : null,
  };
}

function fixture(options: {
  releaseStatus?: V3RegistrationManifest["releaseStatus"];
  chainId?: number;
  rejectWrite?: boolean;
  failCommitReconciliation?: boolean;
  referrer?: Address;
} = {}) {
  let now = 1_000n;
  const currentManifest = manifest(options.releaseStatus);
  const normalized = normalizeName("alice", "sepbase", { maxUtf8Bytes: 96 });
  const scope: V3RegistrationScope = {
    suiteReleaseId,
    chainId: 84_532,
    controller,
    preparedAtBlock: 100n,
    label: "alice",
    node: normalized.node,
    payer,
    recipient,
    durationYears: 1,
    referrer: options.referrer ?? "0x0000000000000000000000000000000000000000",
    expectedAmount: 500n,
    expectedReferralRewardBps: 1_000,
    resolverInitializationHash,
    normalizationAttestationHash: issued().controllerAttestationHash,
    normalizationTypedDataDigest: typedDataDigest,
    commitment,
  };
  const prepareRegistrationReveal = vi.fn(async () => ({
    plan: transactionPlan("register", 200n),
    earliestRevealAt: 1_060n,
    latestRevealAt: 2_000n,
  }));
  const client = {
    manifest: currentManifest,
    normalize: (input: string) => normalizeName(input, currentManifest.suffix, currentManifest.nameRules),
    prepareRegistrationCommit: vi.fn(async () => ({ scope, plan: transactionPlan("commit", 100n) })),
    prepareRegistrationReveal,
    getNameRecord: vi.fn(async (_label: string, blockNumber?: bigint) => blockNumber === undefined
      ? {
        available: false,
        blockNumber: 202n,
        status: "active",
        owner: recipient,
      }
      : { available: true, blockNumber }),
    assertTransactionPlan: vi.fn(),
    reconcileTransaction: vi.fn(async (plan: V3TransactionPlan, hash: Hash) => {
      if (options.failCommitReconciliation && plan.functionName === "commit") {
        throw new Error("receipt response lost");
      }
      return {
        hash,
        blockNumber: plan.functionName === "commit" ? 101n : 201n,
        status: "success" as const,
      };
    }),
  } as unknown as SepbaseV3Client;
  const simulate = vi.fn(async () => undefined);
  const send = vi.fn(async (transaction: { data: Hex }) => {
    if (options.rejectWrite) throw Object.assign(new Error("rejected"), { code: 4_001 });
    return transaction.data === "0xaaaa" ? commitHash : revealHash;
  });
  const adapter: V3RegistrationTransactionAdapter = {
    account: payer,
    chainId: options.chainId ?? 84_532,
    getWalletContext: vi.fn(async () => ({ account: payer, chainId: options.chainId ?? 84_532 })),
    getChainTimestamp: vi.fn(async () => now),
    getBlockTimestamp: vi.fn(async () => 1_000n),
    getRegistrationCommitmentState: vi.fn(async () => ({
      committedAt: 1_000n,
      consumed: false,
      blockNumber: 102n,
      blockTimestamp: now,
    })),
    readAllowance: vi.fn(async () => 500n),
    simulate,
    send,
    waitForReceipt: vi.fn(async () => ({ status: "success" as const, blockNumber: 190n })),
  };
  const storage = new MemoryStorage();
  const fetcher = vi.fn(async () => Response.json({ data: issued() }));
  const randomSource = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint8Array) array.fill(0x42);
      return array;
    },
  };
  const controllerFlow = createV3RegistrationFlowController({
    client,
    transactions: adapter,
    storage,
    fetcher,
    origin: () => "https://names.example",
    randomSource,
  });
  const review = () => controllerFlow.review({
    rawInput: "alice",
    payer,
    recipient,
    durationYears: 1,
    ...(options.referrer ? { referrer: options.referrer } : {}),
    initialization: { addressRecord: recipient, textRecords: [] },
  });
  return {
    controller: controllerFlow,
    client,
    adapter,
    storage,
    fetcher,
    simulate,
    send,
    review,
    setNow(value: bigint) { now = value; },
  };
}

describe("V3 browser registration flow", () => {
  it("sends the full release scope to the fixed same-origin attestation route without a secret", async () => {
    const currentManifest = manifest();
    const normalized = normalizeName("Alice.sepbase", "sepbase", currentManifest.nameRules);
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(input.toString()).toBe("https://names.example/api/v3/normalization-attestation");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        suiteReleaseId,
        chainId: 84_532,
        controller,
        attestor,
        recipient,
        canonicalLabel: "alice",
      });
      expect(body).not.toHaveProperty("secret");
      return Response.json({ data: issued() });
    });
    await expect(requestV3RegistrationAttestation({
      manifest: currentManifest,
      rawInput: "Alice.sepbase",
      normalized,
      canonicalConfirmed: true,
      recipient,
      origin: "https://names.example",
      fetcher: fetcher as typeof fetch,
    })).resolves.toMatchObject({ normalizedLabel: "alice" });
  });

  it("completes commit, waits, reveals with fresh guards and removes recovery state", async () => {
    const flow = fixture();
    flow.review();
    await flow.controller.requestAttestation();
    await expect(flow.controller.commit()).resolves.toMatchObject({ commitment });
    expect(flow.controller.getSnapshot().stage).toBe("too-early");
    flow.setNow(1_060n);
    expect((await flow.controller.tick())?.kind).toBe("ready");
    await expect(flow.controller.reveal()).resolves.toBe(revealHash);
    expect(flow.controller.getSnapshot().stage).toBe("complete");
    expect(flow.client.prepareRegistrationReveal).toHaveBeenCalled();
    expect(flow.client.getNameRecord).toHaveBeenCalledWith("alice", 200n);
    expect(flow.storage.values.size).toBe(0);
  });

  it("keeps attestation, commit and reveal single-flight under same-tick retries", async () => {
    const flow = fixture();
    flow.review();

    const firstAttestation = flow.controller.requestAttestation();
    await expect(flow.controller.requestAttestation()).rejects.toMatchObject({ code: "OPERATION_IN_PROGRESS" });
    await firstAttestation;
    expect(flow.fetcher).toHaveBeenCalledOnce();

    const firstCommit = flow.controller.commit();
    await expect(flow.controller.commit()).rejects.toMatchObject({ code: "OPERATION_IN_PROGRESS" });
    await firstCommit;
    expect(flow.send).toHaveBeenCalledTimes(1);

    flow.setNow(1_060n);
    await flow.controller.tick();
    const firstReveal = flow.controller.reveal();
    await expect(flow.controller.reveal()).rejects.toMatchObject({ code: "OPERATION_IN_PROGRESS" });
    await firstReveal;
    expect(flow.send).toHaveBeenCalledTimes(2);
    expect(flow.controller.getSnapshot().stage).toBe("complete");
  });

  it("blocks early and expired reveal without wallet submission", async () => {
    const early = fixture();
    early.review();
    await early.controller.requestAttestation();
    await early.controller.commit();
    await expect(early.controller.reveal()).rejects.toMatchObject({ code: "COMMITMENT_NOT_READY" });
    expect(early.send).toHaveBeenCalledTimes(1);

    early.setNow(1_601n);
    await early.controller.tick();
    await expect(early.controller.reveal()).rejects.toMatchObject({ code: "COMMITMENT_EXPIRED" });
    expect(early.send).toHaveBeenCalledTimes(1);
  });

  it("recovers a confirmed commitment after page reload", async () => {
    const first = fixture();
    first.review();
    await first.controller.requestAttestation();
    const committed = await first.controller.commit();

    const second = fixture();
    second.storage.values = first.storage.values;
    second.setNow(1_030n);
    await expect(second.controller.restore(payer)).resolves.toMatchObject({ secret: committed.secret });
    expect(second.controller.getSnapshot().stage).toBe("too-early");
  });

  it("recovers the secret from a pre-submit journal after the receipt response is lost", async () => {
    const interrupted = fixture({ failCommitReconciliation: true });
    interrupted.review();
    await interrupted.controller.requestAttestation();
    await expect(interrupted.controller.commit()).rejects.toMatchObject({ code: "COMMIT_FAILED" });
    const pending = interrupted.controller.getSnapshot().journal;
    expect(pending).toMatchObject({
      secret: `0x${"42".repeat(32)}`,
      submittedTransactionHash: commitHash,
    });
    expect(interrupted.controller.getSnapshot().stage).toBe("restart-required");

    const restored = fixture();
    restored.storage.values = interrupted.storage.values;
    await expect(restored.controller.restore(payer)).resolves.toMatchObject({
      secret: pending?.secret,
      commit: { transactionHash: commitHash, confirmedAt: "1000" },
    });
    expect(restored.controller.getSnapshot().stage).toBe("too-early");
  });

  it("supports chain-reconciled recovery when the wallet transaction hash is unknown", async () => {
    const interrupted = fixture({ failCommitReconciliation: true });
    interrupted.review();
    await interrupted.controller.requestAttestation();
    await expect(interrupted.controller.commit()).rejects.toBeDefined();
    const pending = interrupted.controller.getSnapshot().journal!;
    const raw = interrupted.storage.values.get("sepbase:v3:registration-journals:v1")!;
    const envelope = JSON.parse(raw) as { journals: Array<Record<string, unknown>> };
    envelope.journals[0] = { ...envelope.journals[0], submittedTransactionHash: null };
    interrupted.storage.values.set("sepbase:v3:registration-journals:v1", JSON.stringify(envelope));

    const restored = fixture();
    restored.storage.values = interrupted.storage.values;
    await expect(restored.controller.restore(payer)).resolves.toMatchObject({
      secret: pending.secret,
      commit: { transactionHash: null },
    });
  });

  it("uses confirmed chain time instead of a forward-skewed device clock", async () => {
    const first = fixture();
    first.review();
    await first.controller.requestAttestation();
    await first.controller.commit();

    const dateNow = vi.spyOn(Date, "now").mockReturnValue(9_999_999_999_000);
    const restored = fixture();
    restored.storage.values = first.storage.values;
    restored.setNow(1_030n);
    await restored.controller.restore(payer);
    expect(restored.controller.getSnapshot()).toMatchObject({
      stage: "too-early",
      readiness: { now: 1_030n, secondsRemaining: 30n },
    });
    dateNow.mockRestore();
  });

  it("binds a reviewed non-self referrer into the durable reveal material", async () => {
    const referrer = "0x6000000000000000000000000000000000000006" as Address;
    const flow = fixture({ referrer });
    flow.review();
    await flow.controller.requestAttestation();
    await expect(flow.controller.commit()).resolves.toMatchObject({
      referrer,
      expectedReferralRewardBps: 1_000,
    });
    expect(flow.client.prepareRegistrationCommit).toHaveBeenCalledWith(expect.objectContaining({ referrer }));
  });

  it("keeps the exact commitment when a replacement attestation arrives", async () => {
    const flow = fixture();
    flow.review();
    await flow.controller.requestAttestation();
    const session = await flow.controller.commit();
    const replacementSignature = `0x${"22".repeat(64)}1b` as Hex;
    const replacement = issued({
      signature: replacementSignature,
      controllerAttestationHash: hashV3NormalizationAttestation({ validUntil: 1_600n, signature: replacementSignature }),
    });
    expect(() => flow.controller.acceptAttestation(replacement)).toThrow(/requires a new commit/);
    expect(flow.controller.getSnapshot()).toMatchObject({
      stage: "restart-required",
      session: { commitment: session.commitment },
      error: { code: "ATTESTATION_REPLACEMENT_REQUIRES_NEW_COMMIT" },
    });
  });

  it("preserves retry state after wallet rejection and blocks the wrong network", async () => {
    const rejected = fixture({ rejectWrite: true });
    rejected.review();
    await rejected.controller.requestAttestation();
    await expect(rejected.controller.commit()).rejects.toMatchObject({ code: "WALLET_REJECTED" });
    expect(rejected.controller.getSnapshot()).toMatchObject({ stage: "attestation-ready", error: { code: "WALLET_REJECTED" } });

    const wrongNetwork = fixture({ chainId: 1 });
    wrongNetwork.review();
    await wrongNetwork.controller.requestAttestation();
    await expect(wrongNetwork.controller.commit()).rejects.toMatchObject({ code: "WRONG_NETWORK" });
    expect(wrongNetwork.simulate).not.toHaveBeenCalled();
    expect(wrongNetwork.send).not.toHaveBeenCalled();
  });

  it("fails a draft before attestation, secret generation or wallet I/O", async () => {
    const draft = fixture({ releaseStatus: "draft" });
    draft.review();
    await expect(draft.controller.requestAttestation()).rejects.toMatchObject({ code: "V3_NOT_DEPLOYED" });
    expect(draft.fetcher).not.toHaveBeenCalled();
    expect(draft.adapter.getWalletContext).not.toHaveBeenCalled();
    expect(draft.send).not.toHaveBeenCalled();
  });
});
