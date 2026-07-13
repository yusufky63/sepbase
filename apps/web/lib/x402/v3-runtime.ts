import {
  chainNameControllerV3Abi,
  chainNameRegistryV3Abi,
  type V3SuiteManifest,
} from "@sepbase/sdk";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  toBytes,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { X402RegistrationError } from "./errors";
import {
  assertRegistrationExecutionPlanPolicy,
  normalizationControllerAttestationHash,
  type RegistrationExecutionPlanPolicy,
} from "./execution-plan";
import type {
  RegistrationExecutionPlanAdapter,
  RegistrationPlanReconciler,
} from "./registration";
import type {
  NormalizationAttestation,
  RegistrationExecutionPlan,
  X402RegistrationPaymentIntent,
} from "./types";

type RegistrationRequest = {
  label: string;
  recipient: Address;
  durationYears: number;
  referrer: Address;
  secret: Hex;
  resolverInitializationHash: Hex;
  normalizationAttestationHash: Hex;
  expectedAmount: bigint;
  expectedReferralRewardBps: number;
};

type ResolverInitialization = {
  addressRecord: Address;
  textKeys: readonly string[];
  textValues: readonly string[];
};

type ControllerAttestation = { validUntil: bigint; signature: Hex };

type DecodedPlan = {
  commitment: Hex;
  request: RegistrationRequest;
  initialization: ResolverInitialization;
  attestation: ControllerAttestation;
};

const erc20FundingAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
]);

function fail(code: string, message: string): never {
  throw new X402RegistrationError(503, code, message);
}

function decodePlan(plan: RegistrationExecutionPlan): DecodedPlan {
  let commitDecoded: ReturnType<typeof decodeFunctionData>;
  let revealDecoded: ReturnType<typeof decodeFunctionData>;
  try {
    commitDecoded = decodeFunctionData({
      abi: chainNameControllerV3Abi,
      data: plan.steps[0].calldata,
    });
    revealDecoded = decodeFunctionData({
      abi: chainNameControllerV3Abi,
      data: plan.steps[1].calldata,
    });
  } catch {
    fail("EXECUTION_PLAN_CALLDATA_INVALID", "The V3 registration calldata cannot be decoded by the published controller ABI.");
  }
  if (commitDecoded.functionName !== "commit" || revealDecoded.functionName !== "register") {
    fail("EXECUTION_PLAN_FUNCTION_MISMATCH", "The V3 plan must contain exactly commit followed by register.");
  }
  const commitArgs = commitDecoded.args as readonly [Hex] | undefined;
  const revealArgs = revealDecoded.args as readonly [
    RegistrationRequest,
    ResolverInitialization,
    ControllerAttestation,
  ] | undefined;
  if (!commitArgs?.[0] || !revealArgs?.[0] || !revealArgs[1] || !revealArgs[2]) {
    fail("EXECUTION_PLAN_CALLDATA_INVALID", "The V3 registration calldata is incomplete.");
  }
  return {
    commitment: commitArgs[0],
    request: revealArgs[0],
    initialization: revealArgs[1],
    attestation: revealArgs[2],
  };
}

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function v3RegistrationExecutionPolicy(manifest: V3SuiteManifest) {
  const controller = manifest.contracts.controller.address;
  const attestor = manifest.normalization.attestor;
  if (!controller || !attestor) {
    fail("V3_NORMALIZATION_POLICY_REQUIRED", "The V3 controller and immutable normalization attestor must be published.");
  }
  return {
    chainId: manifest.chainId,
    allowNativeValue: manifest.settlement.kind === "native",
    allowlist: {
      commit: {
        target: getAddress(controller),
        selector: encodeFunctionData({
          abi: chainNameControllerV3Abi,
          functionName: "commit",
          args: [`0x${"00".repeat(32)}`],
        }).slice(0, 10) as Hex,
      },
      reveal: {
        target: getAddress(controller),
        selector: encodeFunctionData({
          abi: chainNameControllerV3Abi,
          functionName: "register",
          args: [{
            label: "a",
            recipient: getAddress("0x0000000000000000000000000000000000000001"),
            durationYears: 1,
            referrer: zeroAddress,
            secret: `0x${"00".repeat(32)}`,
            resolverInitializationHash: `0x${"00".repeat(32)}`,
            normalizationAttestationHash: `0x${"00".repeat(32)}`,
            expectedAmount: 1n,
            expectedReferralRewardBps: 0,
          }, {
            addressRecord: getAddress("0x0000000000000000000000000000000000000001"),
            textKeys: [],
            textValues: [],
          }, {
            validUntil: 1n,
            signature: `0x${"00".repeat(65)}`,
          }],
        }).slice(0, 10) as Hex,
      },
    },
    normalization: {
      attestor: getAddress(attestor),
      controller: getAddress(controller),
      normalizationProfileHash: manifest.normalization.profileHash,
    },
  } satisfies RegistrationExecutionPlanPolicy;
}

export class V3RegistrationExecutionPlanAdapter implements RegistrationExecutionPlanAdapter {
  readonly contractGeneration = "v3" as const;

  constructor(readonly options: {
    manifest: V3SuiteManifest;
    publicClient: PublicClient;
    payer: Address;
    policy?: RegistrationExecutionPlanPolicy;
    maxOrderBaseUnits?: bigint;
  }) {}

  get policy() {
    return this.options.policy ?? v3RegistrationExecutionPolicy(this.options.manifest);
  }

  async decodeAndRecomputeCalldata(plan: RegistrationExecutionPlan) {
    const decoded = decodePlan(plan);
    const commit = encodeFunctionData({
      abi: chainNameControllerV3Abi,
      functionName: "commit",
      args: [decoded.commitment],
    });
    const reveal = encodeFunctionData({
      abi: chainNameControllerV3Abi,
      functionName: "register",
      args: [decoded.request, decoded.initialization, decoded.attestation],
    });
    return {
      commit,
      reveal,
      controllerAttestationHash: normalizationControllerAttestationHash(
        decoded.attestation.validUntil.toString(),
        decoded.attestation.signature,
      ),
    };
  }

  async validateBundle(bundle: {
    intent: X402RegistrationPaymentIntent;
    plan: RegistrationExecutionPlan;
  }) {
    const { manifest, publicClient, payer } = this.options;
    const controller = manifest.contracts.controller.address;
    const registry = manifest.contracts.registry.address;
    const settlement = manifest.settlement.tokenAddress;
    if (!controller || !registry || manifest.settlement.kind !== "erc20" || !settlement) {
      fail("V3_DEPLOYMENT_BINDING_MISSING", "The paid V3 runtime requires published controller, registry, and ERC-20 settlement bindings.");
    }
    await assertRegistrationExecutionPlanPolicy(bundle.plan, this.policy);
    const decoded = decodePlan(bundle.plan);
    const planAttestation: NormalizationAttestation = bundle.plan.normalizationAttestation;
    if (
      !same(bundle.intent.asset, settlement)
      || bundle.intent.amountBaseUnits !== decoded.request.expectedAmount.toString()
      || !same(decoded.request.recipient, planAttestation.claims.recipient)
      || decoded.attestation.validUntil.toString() !== planAttestation.claims.validUntil
      || !same(decoded.attestation.signature, planAttestation.signature)
      || bundle.plan.revealWindow.clock !== "timestamp"
      || decoded.initialization.textKeys.length !== decoded.initialization.textValues.length
      || (this.options.maxOrderBaseUnits !== undefined
        && decoded.request.expectedAmount > this.options.maxOrderBaseUnits)
    ) {
      fail("EXECUTION_PLAN_INTENT_MISMATCH", "The V3 plan does not match the authenticated payment, attestation, or commitment policy.");
    }
    const blockNumber = await publicClient.getBlockNumber();
    const [
      node,
      nameAvailable,
      nameReserved,
      initializationHash,
      attestationHash,
      quotedAmount,
      referralRewardBps,
      keeperSettlementBalance,
      keeperSettlementAllowance,
      keeperGasBalance,
      registrationsPaused,
      solvent,
    ] = await Promise.all([
      publicClient.readContract({
        address: getAddress(registry),
        abi: chainNameRegistryV3Abi,
        functionName: "nodeForLabelHash",
        args: [planAttestation.claims.labelHash],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(registry),
        abi: chainNameRegistryV3Abi,
        functionName: "isAvailable",
        args: [decoded.request.label],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(registry),
        abi: chainNameRegistryV3Abi,
        functionName: "reservedLabels",
        args: [planAttestation.claims.labelHash],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "hashResolverInitialization",
        args: [decoded.initialization],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "hashNormalizationAttestation",
        args: [decoded.attestation],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "quote",
        args: [decoded.request.label, decoded.request.durationYears],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "referralRewardBps",
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(settlement),
        abi: erc20FundingAbi,
        functionName: "balanceOf",
        args: [payer],
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(settlement),
        abi: erc20FundingAbi,
        functionName: "allowance",
        args: [payer, getAddress(controller)],
        blockNumber,
      }),
      publicClient.getBalance({ address: payer, blockNumber }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "registrationsPaused",
        blockNumber,
      }),
      publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "isSolvent",
        blockNumber,
      }),
    ]);
    const expectedReferralRewardBps = decoded.request.referrer === zeroAddress
      ? 0
      : referralRewardBps;
    const recomputedCommitment = await publicClient.readContract({
      address: getAddress(controller),
      abi: chainNameControllerV3Abi,
      functionName: "makeCommitment",
      args: [
        node,
        payer,
        decoded.request.recipient,
        decoded.request.durationYears,
        decoded.request.resolverInitializationHash,
        decoded.request.normalizationAttestationHash,
        decoded.request.referrer,
        decoded.request.secret,
        decoded.request.expectedAmount,
        decoded.request.expectedReferralRewardBps,
      ],
      blockNumber,
    });
    if (
      initializationHash !== decoded.request.resolverInitializationHash
      || attestationHash !== decoded.request.normalizationAttestationHash
      || quotedAmount !== decoded.request.expectedAmount
      || expectedReferralRewardBps !== decoded.request.expectedReferralRewardBps
      || recomputedCommitment !== decoded.commitment
      || keeperSettlementBalance < decoded.request.expectedAmount
      || keeperSettlementAllowance < decoded.request.expectedAmount
      || keeperGasBalance === 0n
      || registrationsPaused
      || !solvent
      || !nameAvailable
      || nameReserved
    ) {
      fail("EXECUTION_PLAN_ONCHAIN_MISMATCH", "The V3 plan or pre-funded keeper allowance/balance no longer matches the guarded on-chain registration scope.");
    }
  }
}

export class V3RegistrationPlanReconciler implements RegistrationPlanReconciler {
  constructor(readonly options: {
    manifest: V3SuiteManifest;
    publicClient: PublicClient;
  }) {}

  async reconcileStep(options: {
    plan: RegistrationExecutionPlan;
    step: "commit" | "reveal";
    transactionHash: Hash;
    expectedSigner: Address;
  }) {
    const expected = options.plan.steps.find((step) => step.kind === options.step);
    if (!expected) return "mismatch" as const;
    let transaction: Awaited<ReturnType<PublicClient["getTransaction"]>>;
    let receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>;
    try {
      [transaction, receipt] = await Promise.all([
        this.options.publicClient.getTransaction({ hash: options.transactionHash }),
        this.options.publicClient.getTransactionReceipt({ hash: options.transactionHash }),
      ]);
    } catch {
      return "pending" as const;
    }
    if (receipt.status !== "success") return "reverted" as const;
    if (
      !transaction.to
      || !same(transaction.from, options.expectedSigner)
      || !same(transaction.to, expected.target)
      || !same(transaction.input, expected.calldata)
      || transaction.value.toString() !== expected.valueBaseUnits
    ) return "mismatch" as const;
    const head = await this.options.publicClient.getBlockNumber();
    const confirmations = BigInt(this.options.manifest.requiredConfirmations);
    if (head + 1n < receipt.blockNumber + confirmations) return "pending" as const;
    if (options.step === "reveal") {
      const registry = this.options.manifest.contracts.registry.address;
      if (!registry) return "mismatch" as const;
      const { request } = decodePlan(options.plan);
      const tokenId = BigInt(keccak256(toBytes(request.label)));
      try {
        const owner = await this.options.publicClient.readContract({
          address: getAddress(registry),
          abi: chainNameRegistryV3Abi,
          functionName: "ownerOf",
          args: [tokenId],
          blockNumber: receipt.blockNumber,
        });
        if (!same(owner, request.recipient)) return "mismatch" as const;
      } catch {
        return "mismatch" as const;
      }
    }
    return "confirmed" as const;
  }

  async revealReadiness(options: {
    plan: RegistrationExecutionPlan;
    commitTransaction: Hash;
  }) {
    void options.commitTransaction;
    const controller = this.options.manifest.contracts.controller.address;
    if (!controller) return "expired" as const;
    const { commitment } = decodePlan(options.plan);
    const block = await this.options.publicClient.getBlock();
    const [committedAt, consumed] = await Promise.all([
      this.options.publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "commitments",
        args: [commitment],
        blockNumber: block.number,
      }),
      this.options.publicClient.readContract({
        address: getAddress(controller),
        abi: chainNameControllerV3Abi,
        functionName: "commitmentConsumed",
        args: [commitment],
        blockNumber: block.number,
      }),
    ]);
    if (committedAt === 0n || consumed) return "expired" as const;
    const minimumAge = BigInt(options.plan.revealWindow.minimumAge);
    const maximumAge = BigInt(options.plan.revealWindow.maximumAge);
    if (block.timestamp < committedAt + minimumAge) return "waiting" as const;
    if (block.timestamp > committedAt + maximumAge) return "expired" as const;
    return "ready" as const;
  }
}
