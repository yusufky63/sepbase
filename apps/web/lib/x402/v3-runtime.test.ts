import {
  chainNameControllerV3Abi,
  type V3SuiteManifest,
} from "@sepbase/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  encodeFunctionData,
  getAddress,
  hashTypedData,
  keccak256,
  toBytes,
  zeroAddress,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildRegistrationExecutionPlan,
  normalizationControllerAttestationHash,
} from "./execution-plan";
import type { X402RegistrationPaymentIntent } from "./types";
import {
  V3RegistrationExecutionPlanAdapter,
  V3RegistrationPlanReconciler,
  v3RegistrationExecutionPolicy,
} from "./v3-runtime";

const controller = getAddress("0x1111111111111111111111111111111111111111");
const registry = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const payer = getAddress("0x4444444444444444444444444444444444444444");
const recipient = getAddress("0x5555555555555555555555555555555555555555");
const profileHash = `0x${"66".repeat(32)}` as Hex;
const secret = `0x${"77".repeat(32)}` as Hex;
const commitment = `0x${"88".repeat(32)}` as Hex;
const initializationHash = `0x${"99".repeat(32)}` as Hex;
const amount = 500n;

async function fixture() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const manifest = {
    chainId: 84_532,
    requiredConfirmations: 5,
    settlement: { kind: "erc20", tokenAddress: token, decimals: 6, symbol: "USDC" },
    normalization: { attestor: account.address, profileHash },
    contracts: {
      controller: { address: controller },
      registry: { address: registry },
    },
  } as unknown as V3SuiteManifest;
  const policy = v3RegistrationExecutionPolicy(manifest);
  const label = "agent";
  const labelHash = keccak256(toBytes(label));
  const validUntil = 1_900_000_000n;
  const typedData = {
    domain: { name: "ChainNameControllerV3", version: "3", chainId: 84_532, verifyingContract: controller },
    types: {
      NormalizationAttestation: [
        { name: "chainId", type: "uint256" },
        { name: "controller", type: "address" },
        { name: "normalizationProfileHash", type: "bytes32" },
        { name: "labelHash", type: "bytes32" },
        { name: "recipient", type: "address" },
        { name: "validUntil", type: "uint64" },
      ],
    },
    primaryType: "NormalizationAttestation" as const,
    message: {
      chainId: 84_532n,
      controller,
      normalizationProfileHash: profileHash,
      labelHash,
      recipient,
      validUntil,
    },
  } as const;
  const signature = await account.signTypedData(typedData);
  const controllerAttestationHash = normalizationControllerAttestationHash(
    validUntil.toString(),
    signature,
  );
  const initialization = { addressRecord: recipient, textKeys: ["url"], textValues: ["https://example.test"] };
  const request = {
    label,
    recipient,
    durationYears: 1,
    referrer: zeroAddress,
    secret,
    resolverInitializationHash: initializationHash,
    normalizationAttestationHash: controllerAttestationHash,
    expectedAmount: amount,
    expectedReferralRewardBps: 0,
  };
  const controllerAttestation = { validUntil, signature };
  const commitCalldata = encodeFunctionData({
    abi: chainNameControllerV3Abi,
    functionName: "commit",
    args: [commitment],
  });
  const revealCalldata = encodeFunctionData({
    abi: chainNameControllerV3Abi,
    functionName: "register",
    args: [request, initialization, controllerAttestation],
  });
  const plan = await buildRegistrationExecutionPlan({
    value: {
      schema: "sepbase.x402.registration-plan.v1",
      quoteId: `sha256:${"aa".repeat(32)}`,
      chainId: 84_532,
      network: "eip155:84532",
      normalizationAttestation: {
        schema: "sepbase.normalization-attestation.v1",
        domain: { name: "ChainNameControllerV3", version: "3" },
        claims: {
          chainId: 84_532,
          controller,
          normalizationProfileHash: profileHash,
          labelHash,
          recipient,
          validUntil: validUntil.toString(),
        },
        typedDataDigest: hashTypedData(typedData),
        controllerAttestationHash,
        signature,
      },
      steps: [
        { kind: "commit", target: controller, selector: commitCalldata.slice(0, 10) as Hex, calldata: commitCalldata, valueBaseUnits: "0" },
        { kind: "reveal", target: controller, selector: revealCalldata.slice(0, 10) as Hex, calldata: revealCalldata, valueBaseUnits: "0" },
      ],
      revealWindow: { clock: "timestamp", minimumAge: "60", maximumAge: "86400" },
    },
    policy,
    nowSeconds: 1_800_000_000,
  });
  const intent: X402RegistrationPaymentIntent = {
    quoteId: plan.quoteId,
    planId: plan.planId,
    chainId: 84_532,
    network: "eip155:84532",
    resourcePath: "/api/x402/registration",
    description: "Register agent.sepbase",
    asset: token,
    amountBaseUnits: amount.toString(),
    payTo: payer,
    issuedAt: "1800000000",
    expiresAt: "1800000300",
    paymentTimeoutSeconds: 300,
    normalizationTypedDataDigest: plan.normalizationAttestation.typedDataDigest,
    controllerAttestationHash,
    normalizationValidUntil: validUntil.toString(),
  };
  return { manifest, plan, intent, initialization, controllerAttestationHash };
}

describe("V3 x402 on-chain plan runtime", () => {
  it("decodes and byte-recomputes the exact published commit/register ABI", async () => {
    const { manifest, plan, controllerAttestationHash } = await fixture();
    const adapter = new V3RegistrationExecutionPlanAdapter({
      manifest,
      payer,
      publicClient: {} as PublicClient,
    });
    await expect(adapter.decodeAndRecomputeCalldata(plan)).resolves.toEqual({
      commit: plan.steps[0].calldata,
      reveal: plan.steps[1].calldata,
      controllerAttestationHash,
    });
  });

  it("recomputes commitment, price, referral and hashes against one pinned chain block", async () => {
    const { manifest, plan, intent, initialization, controllerAttestationHash } = await fixture();
    const readContract = vi.fn(async (request: { functionName: string; blockNumber: bigint }) => {
      switch (request.functionName) {
        case "nodeForLabelHash": return `0x${"ab".repeat(32)}`;
        case "hashResolverInitialization": return initializationHash;
        case "hashNormalizationAttestation": return controllerAttestationHash;
        case "quote": return amount;
        case "referralRewardBps": return 1_000;
        case "balanceOf": return 10_000n;
        case "allowance": return 10_000n;
        case "registrationsPaused": return false;
        case "isSolvent": return true;
        case "isAvailable": return true;
        case "reservedLabels": return false;
        case "makeCommitment": return commitment;
        default: throw new Error("unexpected read");
      }
    });
    const adapter = new V3RegistrationExecutionPlanAdapter({
      manifest,
      payer,
      publicClient: {
        getBlockNumber: vi.fn(async () => 123n),
        getBalance: vi.fn(async () => 1n),
        readContract,
      } as unknown as PublicClient,
    });
    await expect(adapter.validateBundle({ intent, plan })).resolves.toBeUndefined();
    expect(readContract).toHaveBeenCalledTimes(12);
    expect(readContract.mock.calls.every(([call]) => call.blockNumber === 123n)).toBe(true);
    expect(initialization.textKeys).toEqual(["url"]);
  });

  it("requires confirmations, exact transaction bindings, and reveal ownership post-state", async () => {
    const { manifest, plan } = await fixture();
    const revealHash = `0x${"bb".repeat(32)}` as Hash;
    const client = {
      getTransaction: vi.fn(async () => ({
        from: payer,
        to: controller,
        input: plan.steps[1].calldata,
        value: 0n,
      })),
      getTransactionReceipt: vi.fn(async () => ({ status: "success", blockNumber: 200n })),
      getBlockNumber: vi.fn(async () => 204n),
      readContract: vi.fn(async () => recipient),
    } as unknown as PublicClient;
    const reconciler = new V3RegistrationPlanReconciler({ manifest, publicClient: client });
    await expect(reconciler.reconcileStep({
      plan,
      step: "reveal",
      transactionHash: revealHash,
      expectedSigner: payer,
    })).resolves.toBe("confirmed");
    expect(vi.mocked(client.readContract)).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "ownerOf",
      args: [BigInt(keccak256(toBytes("agent")))],
      blockNumber: 200n,
    }));
  });
});
