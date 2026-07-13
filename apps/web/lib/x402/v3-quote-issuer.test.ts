import {
  chainNameControllerV3Abi,
  type SepbaseV3Client,
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
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { normalizationControllerAttestationHash } from "./execution-plan";
import { createHmacQuoteAuthenticator } from "./quote-auth";
import type { V3PaidRegistrationRuntime } from "./runtime-factory";
import { issueV3PaidRegistrationQuote } from "./v3-quote-issuer";

const controller = getAddress("0x1111111111111111111111111111111111111111");
const registry = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const payer = getAddress("0x4444444444444444444444444444444444444444");
const recipient = getAddress("0x5555555555555555555555555555555555555555");
const profileHash = `0x${"66".repeat(32)}` as Hex;
const secret = `0x${"77".repeat(32)}` as Hex;

describe("V3 paid quote issuance", () => {
  it("persists the secret-bearing plan encrypted and returns only the signed quote identifiers", async () => {
    const attestor = privateKeyToAccount(generatePrivateKey());
    const manifest = {
      suiteReleaseId: `sha256:${"aa".repeat(32)}`,
      chainId: 84_532,
      suffix: "sepbase",
      nameRules: { minCodepoints: 1, maxCodepoints: 32, maxUtf8Bytes: 96 },
      normalization: { attestor: attestor.address, profileHash },
      contracts: { controller: { address: controller }, registry: { address: registry } },
      settlement: { kind: "erc20", tokenAddress: token, decimals: 6, symbol: "USDC" },
      commitment: { minAgeSeconds: "60", maxAgeSeconds: "86400" },
    } as unknown as V3SuiteManifest;
    const label = "agent";
    const labelHash = keccak256(toBytes(label));
    const validUntil = 1_800_000_900n;
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
    const signature = await attestor.signTypedData(typedData);
    const controllerAttestationHash = normalizationControllerAttestationHash(validUntil.toString(), signature);
    const attestation = {
      schema: "sepbase.normalization-attestation.v1" as const,
      domain: { name: "ChainNameControllerV3" as const, version: "3" as const },
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
    };
    const commitment = `0x${"88".repeat(32)}` as Hex;
    const resolverInitializationHash = `0x${"99".repeat(32)}` as Hex;
    const commitData = encodeFunctionData({
      abi: chainNameControllerV3Abi,
      functionName: "commit",
      args: [commitment],
    });
    const prepareRegistrationCommit = vi.fn(async () => ({
      scope: {
        suiteReleaseId: manifest.suiteReleaseId,
        chainId: 84_532,
        controller,
        preparedAtBlock: 100n,
        label,
        node: `0x${"ab".repeat(32)}` as Hex,
        payer,
        recipient,
        durationYears: 1 as const,
        referrer: zeroAddress,
        expectedAmount: 500n,
        expectedReferralRewardBps: 0,
        resolverInitializationHash,
        normalizationAttestationHash: controllerAttestationHash,
        normalizationTypedDataDigest: attestation.typedDataDigest,
        commitment,
      },
      plan: {
        suiteReleaseId: manifest.suiteReleaseId,
        chainId: 84_532,
        expectedSender: payer,
        to: controller,
        data: commitData,
        value: 0n,
        functionName: "commit",
        blockNumber: 100n,
        settlementApproval: null,
      },
    }));
    const persistPreparedPlan = vi.fn(async (prepared) => ({ outcome: "stored" as const, prepared }));
    const validateBundle = vi.fn(async () => undefined);
    const configured = {
      runtime: {
        signer: { address: payer },
        quoteAuthenticator: createHmacQuoteAuthenticator({ keyId: "test-key", key: new Uint8Array(32).fill(7) }),
        planAdapter: { validateBundle },
        store: { persistPreparedPlan },
      },
      attestationIssuer: { issue: vi.fn(async () => attestation) },
    } as unknown as V3PaidRegistrationRuntime;
    const client = {
      manifest,
      prepareRegistrationCommit,
      getNameRecord: vi.fn(async () => ({
        blockNumber: 100n,
        available: true,
        reserved: false,
      })),
    } as unknown as SepbaseV3Client;

    const result = await issueV3PaidRegistrationQuote({
      label,
      recipient,
      durationYears: 1,
      referrer: null,
      initialization: { addressRecord: recipient, textRecords: [{ key: "url", value: "https://example.test" }] },
    }, {
      configured,
      client,
      manifest,
      nowSeconds: 1_800_000_000,
      ttlSeconds: 300,
      randomSecret: () => secret,
    });

    expect(result).toMatchObject({ quoteId: result.signedQuote.quoteId, planId: result.signedQuote.planId });
    expect(JSON.stringify(result)).not.toContain(secret.slice(2));
    expect(persistPreparedPlan).toHaveBeenCalledOnce();
    const persisted = persistPreparedPlan.mock.calls[0]![0];
    expect(persisted.executionPlan.steps[1].calldata).toContain(secret.slice(2));
    expect(persisted.signedQuote).toEqual(result.signedQuote);
    expect(validateBundle).toHaveBeenCalledOnce();
  });
});
