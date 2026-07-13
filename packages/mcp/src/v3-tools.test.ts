import {
  NameNormalizationError,
  SepbaseError,
  type NormalizedName,
  type SepbaseV3Client,
  type V3TransactionPlan,
} from "@sepbase/sdk";
import { zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createSepbaseV3ToolHandlers } from "./v3-tools.js";

const account = "0x78de409a6306550882328E2a67160471368387FF" as const;
const secondAccount = "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac" as const;
const controller = "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945" as const;
const marketplace = "0x1111111111111111111111111111111111111111" as const;
const migration = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;
const labelHash = `0x${"11".repeat(32)}` as const;
const node = `0x${"22".repeat(32)}` as const;
const suiteReleaseId = `sha256:${"ab".repeat(32)}` as const;

function normalized(rawInput = "alice"): NormalizedName {
  return {
    rawInput,
    normalizedLabel: "alice",
    normalizedFullName: "alice.sepbase",
    suffix: "sepbase",
    labelHash,
    node,
    tokenId: 17n,
    codePointLength: 5,
    utf8ByteLength: 5,
    changed: rawInput !== "alice",
  };
}

function transactionPlan(): V3TransactionPlan {
  return {
    suiteReleaseId,
    chainId: 84532,
    expectedSender: account,
    to: marketplace,
    data: "0x1234",
    value: 0n,
    functionName: "list",
    blockNumber: 99n,
    settlementApproval: {
      token,
      spender: marketplace,
      amount: 1_250_000n,
      data: "0xabcd",
    },
  };
}

function v3Client(overrides: Record<string, unknown> = {}) {
  const getBlockNumber = vi.fn(async () => 99n);
  const getBlock = vi.fn(async () => ({ timestamp: 1_900_000_000n }));
  const readContract = vi.fn(async (request: { functionName: string }) => {
    switch (request.functionName) {
      case "migrationPaused": return false;
      case "migrationStartsAt": return 1_800_000_000n;
      case "migrationEndsAt": return 2_000_000_000n;
      case "sourceChainId": return 84532n;
      case "legacyRegistry": return secondAccount;
      case "isReserved": return true;
      default: throw new Error(`Unexpected read: ${request.functionName}`);
    }
  });
  const prepareRegistrationCommit = vi.fn();
  const prepareRegistrationReveal = vi.fn();
  const getNameRecord = vi.fn(async () => ({
    label: "alice",
    fullName: "alice.sepbase",
    node,
    tokenId: 17n,
    status: "active" as const,
    owner: account,
    resolvedAddress: account,
    expiresAt: 2_000_000_000n,
    available: false,
    reserved: false,
    transferNonce: 4n,
    blockNumber: 99n,
  }));
  const quoteRegistration = vi.fn(async () => 1_250_000n);
  const getListings = vi.fn(async () => ({
    items: [],
    nextCursor: 0n,
    blockNumber: 99n,
  }));
  const prepareMarketplaceApproval = vi.fn(async () => ({
    ...transactionPlan(),
    settlementApproval: null,
    functionName: "approve",
  }));
  const prepareList = vi.fn(async () => transactionPlan());
  const prepareClearPrimary = vi.fn(async () => ({
    ...transactionPlan(),
    settlementApproval: null,
    functionName: "clearPrimaryName",
  }));
  const client = {
    manifest: {
      schemaVersion: 4,
      suiteVersion: "3.0.0",
      suiteReleaseId,
      releaseStatus: "candidate",
      chainId: 84532,
      chainName: "Base Sepolia",
      suffix: "sepbase",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      settlement: {
        kind: "erc20",
        tokenAddress: token,
        name: "Mock USD",
        symbol: "MUSD",
        decimals: 6,
      },
      pricing: { referralRewardBps: 1000 },
      normalization: {
        attestor: secondAccount,
        profileId: "ensip15:test",
        profileHash: labelHash,
        maxAttestationValiditySeconds: "900",
      },
      commitment: { minAgeSeconds: "60", maxAgeSeconds: "86400" },
      endpoints: {
        normalizationAttestation: "/api/v3/normalization-attestation",
        accountApi: "/api/v3/account/{address}",
        x402Quote: "/api/x402/registration/quote",
        x402Registration: "/api/x402/registration",
        x402Status: "/api/x402/registration/status",
      },
      x402: {
        paidExecutionAvailable: false,
        network: "eip155:84532",
        scheme: "exact",
      },
    },
    origin: new URL("https://names.example/.well-known/chain-name-service-v3.json"),
    contracts: {
      controller: { address: controller, abi: [] },
      marketplace: { address: marketplace, abi: [] },
      migration: { address: migration, abi: [] },
    },
    publicClient: { getBlockNumber, getBlock, readContract },
    normalize: vi.fn((input: string) => normalized(input)),
    getNameRecord,
    quoteRegistration,
    resolveText: vi.fn(async () => "alice@example.com"),
    reverseResolve: vi.fn(async () => ({ name: "alice.sepbase", verified: true })),
    getOwnedNames: vi.fn(async () => ({
      items: [await getNameRecord()],
      total: 1n,
      nextCursor: 1n,
      blockNumber: 99n,
    })),
    getAccountBalances: vi.fn(async () => ({
      account,
      referralRewards: 1_250_000n,
      marketplaceClaimable: 2_500_000n,
      primary: { address: account, name: "alice.sepbase", verified: true, reason: null, blockNumber: 99n },
      blockNumber: 99n,
    })),
    getListings,
    getGlobalOffers: vi.fn(async () => ({ items: [], nextCursor: 0n, blockNumber: 99n })),
    getBuyerOffers: vi.fn(async () => ({ items: [], nextCursor: 0n, blockNumber: 99n })),
    getOwnerOffers: vi.fn(async () => ({ items: [], nextCursor: 0n, blockNumber: 99n })),
    getAuctions: vi.fn(async () => ({ items: [], nextCursor: 0n, blockNumber: 99n })),
    getLiabilities: vi.fn(async () => ({
      controllerProtectedBalance: 1n,
      referralLiability: 1n,
      marketplaceProtectedBalance: 3n,
      claimableLiability: 1n,
      offerEscrow: 1n,
      auctionEscrow: 1n,
      suiteProtectedBalance: 4n,
      suiteSettlementBalance: 5n,
      controllerSolvent: true,
      marketplaceSolvent: true,
      suiteSolvent: true,
      blockNumber: 99n,
    })),
    prepareRegistrationCommit,
    prepareRegistrationReveal,
    prepareMarketplaceApproval,
    prepareList,
    prepareClearPrimary,
    ...overrides,
  } as unknown as SepbaseV3Client;
  return {
    client,
    spies: {
      getBlockNumber,
      getBlock,
      readContract,
      getNameRecord,
      quoteRegistration,
      getListings,
      prepareList,
      prepareMarketplaceApproval,
      prepareClearPrimary,
      prepareRegistrationCommit,
      prepareRegistrationReveal,
    },
  };
}

function handlers(client: SepbaseV3Client) {
  return createSepbaseV3ToolHandlers(async () => client);
}

function containsBigInt(value: unknown): boolean {
  if (typeof value === "bigint") return true;
  if (Array.isArray(value)) return value.some(containsBigInt);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsBigInt);
  }
  return false;
}

describe("SEPBASE V3 MCP tool boundary", () => {
  it("returns owned names and distinct account balances from bounded pinned reads", async () => {
    const mock = v3Client();
    const names = await handlers(mock.client).ownedNames({ account, cursor: "0", limit: 10 });
    expect(names).toMatchObject({
      ok: true,
      data: { account, total: "1", nextCursor: "1", blockNumber: "99" },
    });
    const balances = await handlers(mock.client).accountBalances({ account });
    expect(balances).toMatchObject({
      ok: true,
      data: {
        account,
        referralRewardsBaseUnits: "1250000",
        formattedReferralRewards: "1.25",
        marketplaceClaimableBaseUnits: "2500000",
        formattedMarketplaceClaimable: "2.5",
        primary: { verified: true },
        blockNumber: "99",
      },
    });
  });

  it("pins registration quote and returns every integer in JSON-safe form", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).quoteRegistration({
      name: "Alice.sepbase",
      durationYears: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      durationYears: 2,
      quoteBaseUnits: "1250000",
      formattedQuote: "1.25",
      blockNumber: "99",
    });
    expect(mock.spies.quoteRegistration).toHaveBeenCalledWith("alice", 2, 99n);
    expect(containsBigInt(result.data)).toBe(false);
    expect(() => JSON.stringify(result.data)).not.toThrow();
  });

  it("returns registration requirements without invoking commit or reveal preparation", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).registrationRequirements({
      name: "alice",
      durationYears: 1,
      recipient: account,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      registration: {
        recipient: account,
        expectedAmountBaseUnits: "1250000",
        expectedReferralRewardBps: 1000,
      },
      commitment: {
        minimumAgeSeconds: "60",
        maximumAgeSeconds: "86400",
      },
      x402: {
        quoteEndpoint: "https://names.example/api/x402/registration/quote",
        paidExecutionAvailable: false,
      },
      mcpBoundary: {
        mode: "requirements-only",
        preparesRegistrationCommit: false,
        preparesRegistrationReveal: false,
        signsTransactions: false,
        sendsTransactions: false,
      },
    });
    expect(mock.spies.prepareRegistrationCommit).not.toHaveBeenCalled();
    expect(mock.spies.prepareRegistrationReveal).not.toHaveBeenCalled();
    expect(JSON.stringify(result.data)).not.toContain("0xdeadbeef");
  });

  it("serializes guarded SDK plans and configured ERC-20 approval data", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).prepareListing({
      seller: account,
      tokenId: "17",
      price: "1250000",
      deadline: "2000000000",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mock.spies.prepareList).toHaveBeenCalledWith({
      seller: account,
      tokenId: 17n,
      price: 1_250_000n,
      deadline: 2_000_000_000n,
    });
    expect(result.data).toMatchObject({
      planType: "unsigned-guarded-transaction",
      transaction: {
        expectedSender: account,
        calldata: "0x1234",
        nativeValueBaseUnits: "0",
        blockNumber: "99",
      },
      settlementApproval: {
        token,
        spender: marketplace,
        amountBaseUnits: "1250000",
        formattedAmount: "1.25",
        calldata: "0xabcd",
      },
      safety: {
        walletReviewAndSimulationRequired: true,
        serverCanSign: false,
        serverCanSendTransaction: false,
        serverCanStartPayment: false,
      },
    });
    expect(containsBigInt(result.data)).toBe(false);
  });

  it("exposes a least-authority marketplace approval as an unsigned plan", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).prepareMarketplaceApproval({
      owner: account,
      tokenId: "17",
    });

    expect(result.ok).toBe(true);
    expect(mock.spies.prepareMarketplaceApproval).toHaveBeenCalledWith({ owner: account, tokenId: 17n });
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      planType: "unsigned-guarded-transaction",
      transaction: { expectedSender: account, nativeValueBaseUnits: "0" },
      settlementApproval: null,
      safety: { serverCanSign: false, serverCanSendTransaction: false },
    });
  });

  it("exposes primary-name clearing as an account-scoped unsigned plan", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).preparePrimaryNameClear({ owner: account });

    expect(result.ok).toBe(true);
    expect(mock.spies.prepareClearPrimary).toHaveBeenCalledWith({ owner: account });
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      planType: "unsigned-guarded-transaction",
      transaction: { expectedSender: account, functionName: "clearPrimaryName" },
      safety: { serverCanSign: false, serverCanSendTransaction: false },
    });
  });

  it("rejects pagination beyond the suite's bounded page size", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).listings({ cursor: "0", limit: 51 });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Page limit must be an integer from 1 to 50.",
      },
    });
    expect(mock.spies.getListings).not.toHaveBeenCalled();
  });

  it("requires same-block forward ownership confirmation for reverse resolution", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).reverse({ address: account });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      address: account,
      primaryName: "alice.sepbase",
      verified: true,
      verificationReason: "forward-owner-confirmed",
      blockNumber: "99",
    });
    expect(mock.client.reverseResolve).toHaveBeenCalledWith(account, 99n);
    expect(mock.spies.getNameRecord).toHaveBeenCalledWith("alice.sepbase", 99n);
  });

  it("reads the migration window and optional reservation at one block", async () => {
    const mock = v3Client();
    const result = await handlers(mock.client).migrationStatus({ name: "alice" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      migration: {
        contract: migration,
        legacyRegistry: secondAccount,
        sourceChainId: "84532",
        phase: "open",
        blockNumber: "99",
      },
      name: {
        tokenId: "17",
        reservedByMigration: true,
      },
    });
    for (const request of mock.spies.readContract.mock.calls.map(([value]) => value)) {
      expect(request).toMatchObject({ blockNumber: 99n });
    }
  });

  it("rejects migration inputs that require normalization before SDK planning", async () => {
    const prepareMigrationClaim = vi.fn(async () => transactionPlan());
    const mock = v3Client({
      prepareMigrationClaim,
      normalize: vi.fn((input: string) => ({
        ...normalized(input),
        normalizedLabel: input,
        normalizedFullName: `${input}.sepbase`,
        changed: false,
      })),
    });
    const base = {
      caller: account,
      recipient: secondAccount,
      expectedLegacyOwner: account,
      importLegacyResolution: false,
    };

    const invalid = await handlers(mock.client).prepareMigrationClaim({
      ...base,
      legacyLabel: "Alice",
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(prepareMigrationClaim).not.toHaveBeenCalled();

    const valid = await handlers(mock.client).prepareMigrationClaim({
      ...base,
      legacyLabel: "alice-one",
    });
    expect(valid).toMatchObject({ ok: true });
    expect(prepareMigrationClaim).toHaveBeenCalledWith({
      ...base,
      legacyLabel: "alice-one",
    });
  });

  it("returns account-scoped migration claim eligibility from the SDK boundary", async () => {
    const getMigrationEligibility = vi.fn(async () => ({
      account,
      label: "alice",
      tokenId: 17n,
      blockNumber: 99n,
      blockTimestamp: 1_900_000_000n,
      sourceChainId: 84_532n,
      legacyRegistry: secondAccount,
      migrationStartsAt: 1_800_000_000n,
      migrationEndsAt: 2_000_000_000n,
      phase: "open" as const,
      legacyStatus: "active" as const,
      legacyOwner: account,
      legacyExpiresAt: 2_000_000_000n,
      legacyResolution: secondAccount,
      reserved: true,
      eligible: true,
      reason: null,
    }));
    const mock = v3Client({ getMigrationEligibility });
    const result = await handlers(mock.client).migrationStatus({ name: "alice", account });

    expect(result).toMatchObject({
      ok: true,
      data: {
        migration: { phase: "open", blockNumber: "99" },
        claimEligibility: {
          account,
          eligible: true,
          legacyStatus: "active",
          legacyOwner: account,
          legacyResolution: secondAccount,
        },
      },
    });
    expect(getMigrationEligibility).toHaveBeenCalledWith({ account, legacyLabel: "alice" });
  });

  it("maps ENSIP-15 failures to a stable invalid-input error", async () => {
    const mock = v3Client({
      normalize: vi.fn(() => {
        throw new NameNormalizationError("INVALID_NAME", "Name is not canonical.");
      }),
    });
    const result = await handlers(mock.client).normalize({ name: "bad" });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_INPUT", message: "Name is not canonical." },
    });
  });

  it("sanitizes unavailable on-chain operations to a stable public error", async () => {
    const mock = v3Client({
      prepareList: vi.fn(async () => {
        throw new SepbaseError(
          "listing missing at https://user:credential@rpc.example",
          "LISTING_NOT_FOUND",
          404,
        );
      }),
    });
    const result = await handlers(mock.client).prepareListing({
      seller: account,
      tokenId: "17",
      price: "1250000",
      deadline: "2000000000",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "OPERATION_NOT_READY",
        message: "The requested on-chain operation is not currently available.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("credential");
  });

  it("keeps address clearing available without treating zero as a wallet account", async () => {
    const prepareSetAddress = vi.fn(async () => transactionPlan());
    const mock = v3Client({ prepareSetAddress });
    const result = await handlers(mock.client).prepareAddressRecord({
      owner: account,
      name: "alice",
      target: zeroAddress,
    });

    expect(result.ok).toBe(true);
    expect(prepareSetAddress).toHaveBeenCalledWith({
      owner: account,
      label: "alice",
      target: zeroAddress,
    });
  });
});
