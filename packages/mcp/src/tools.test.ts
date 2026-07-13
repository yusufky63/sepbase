import {
  RpcUnavailableError,
  type SepbaseClient,
} from "@sepbase/sdk";
import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createSepbaseToolHandlers, toStableMcpError } from "./tools.js";

const recipient = "0x78de409a6306550882328E2a67160471368387FF" as const;
const referrer = "0xEAa823AB4C4eE00283d8ed7be713ddf8A5ba0Fac" as const;
const contract = "0xe000de3efe798Aa4F834fd952Bef35BAE1B16945" as const;

const registerAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "label", type: "string" },
      { name: "durationYears", type: "uint8" },
      { name: "recipient", type: "address" },
      { name: "referrer", type: "address" },
      { name: "expectedAmount", type: "uint256" },
      { name: "expectedReferralRewardBps", type: "uint16" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "durationYears", type: "uint8" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "referralRewardBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
] as const;

function client(overrides: Record<string, unknown> = {}) {
  const settlement = {
    kind: "native" as const,
    tokenAddress: null,
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  };
  const readContract = vi.fn(async (request: { functionName: string }) => {
    if (request.functionName === "quote") return 2_000_000_000_000_000n;
    if (request.functionName === "referralRewardBps") return 1000;
    throw new Error("Unexpected read");
  });
  return {
    manifest: {
      chainId: 84532,
      chainName: "Base Sepolia",
      contract,
      suffix: "sepbase",
      nameRules: { minLength: 1, maxLength: 32, allowedYears: [1, 2, 3, 4, 5] },
      settlement,
    },
    abi: registerAbi,
    publicClient: { readContract },
    getNameState: vi.fn(async () => ({
      lifecycle: "unregistered" as const,
      reserved: false,
      available: true,
      registrationsPaused: false,
      solvent: true,
      canRegister: true,
      blockNumber: 123n,
    })),
    verifyName: vi.fn(async (
      _label: string,
      _expected?: string,
      options?: { blockNumber?: bigint },
    ) => ({
      label: "alice",
      fullName: "alice.sepbase",
      tokenId: 1n,
      lifecycle: "active" as const,
      owner: recipient,
      resolvedAddress: recipient,
      primaryName: "alice.sepbase",
      expectedAddress: null,
      expiresAt: 2_000_000_000n,
      verified: true,
      reason: "verified" as const,
      blockNumber: options?.blockNumber ?? 122n,
    })),
    verifyAddress: vi.fn(async () => ({
      account: recipient,
      primaryName: "alice.sepbase",
      label: "alice",
      tokenId: 1n,
      lifecycle: "active" as const,
      owner: recipient,
      resolvedAddress: recipient,
      expiresAt: 2_000_000_000n,
      verified: true,
      reason: "verified" as const,
      blockNumber: 122n,
    })),
    resolveName: vi.fn(async () => referrer),
    getNameProfile: vi.fn(async () => ({
      displayName: "Alice",
      bio: "",
      avatar: "",
      website: "",
      twitter: "",
      github: "",
    })),
    getListing: vi.fn(async () => null),
    quoteName: vi.fn(async () => 2_000_000_000_000_000n),
    getSettlementAsset: vi.fn(async () => settlement),
    getActiveListings: vi.fn(async () => ({
      items: [],
      marketplacePaused: false,
      solvent: true,
      blockNumber: 123n,
      nextCursor: null,
      hasMore: false,
      scanned: 0,
    })),
    getProtocolHealth: vi.fn(async () => ({
      settlementBalance: 10n,
      protectedLiability: 4n,
      solvent: true,
      blockNumber: 123n,
    })),
    ...overrides,
  } as unknown as SepbaseClient;
}

function handlers(mockClient: SepbaseClient) {
  return createSepbaseToolHandlers(async () => mockClient);
}

describe("SEPBASE MCP tool boundary", () => {
  it("never exposes raw RPC details", () => {
    const result = toStableMcpError(new RpcUnavailableError(
      "provider failed at https://user:secret@example.invalid/rpc",
    ));

    expect(result).toEqual({
      code: "RPC_UNAVAILABLE",
      message: "The configured chain RPC could not complete this read.",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses one verification snapshot for effective name identity", async () => {
    const mock = client();
    const result = await handlers(mock).nameInfo({ label: "Alice.sepbase" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      label: "alice",
      resolvedAddress: recipient,
      owner: recipient,
      identityVerified: true,
      blockNumber: "123",
    });
    expect(mock.verifyName).toHaveBeenCalledWith("alice", undefined, { blockNumber: 123n });
    expect(mock.getNameProfile).toHaveBeenCalledWith("alice", { blockNumber: 123n });
    expect(mock.getListing).toHaveBeenCalledWith(expect.anything(), { blockNumber: 123n });
    expect(mock.resolveName).not.toHaveBeenCalled();
  });

  it("formats marketplace amounts with configured ERC-20 precision", async () => {
    const settlement = {
      kind: "erc20" as const,
      tokenAddress: contract,
      name: "Mock USD",
      symbol: "MUSD",
      decimals: 6,
    };
    const mock = client({
      getSettlementAsset: vi.fn(async () => settlement),
      getActiveListings: vi.fn(async () => ({
        items: [{
          tokenId: 7n,
          label: "alice",
          fullName: "alice.sepbase",
          seller: recipient,
          price: 1_234_567n,
          feeBps: 0,
          listedAt: 1_900_000_000n,
          expiresAt: 2_000_000_000n,
          purchasable: true,
        }],
        marketplacePaused: false,
        solvent: true,
        blockNumber: 123n,
        nextCursor: 1n,
        hasMore: true,
        scanned: 1,
      })),
    });

    const result = await handlers(mock).marketListings({ limit: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toEqual([expect.objectContaining({
      priceBaseUnits: "1234567",
      formattedPrice: "1.234567",
    })]);
    expect(result.data.nextCursor).toBe("1");
  });

  it("pins a registration quote to the reported state block", async () => {
    const mock = client();
    const result = await handlers(mock).quoteRegistration({
      label: "alice",
      durationYears: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      quoteBaseUnits: "2000000000000000",
      blockNumber: "123",
    });
    expect(mock.publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "quote",
      blockNumber: 123n,
    }));
    expect(mock.quoteName).not.toHaveBeenCalled();
  });

  it.each([
    ["native", 2_000_000_000_000_000n],
    ["erc20", 0n],
  ] as const)("prepares guarded %s calldata without broadcasting", async (kind, expectedValue) => {
    const settlement = kind === "native"
      ? { kind, tokenAddress: null, name: "Ether", symbol: "ETH", decimals: 18 }
      : { kind, tokenAddress: contract, name: "Mock USD", symbol: "MUSD", decimals: 6 };
    const mock = client({
      manifest: {
        chainId: 84532,
        chainName: "Base Sepolia",
        contract,
        suffix: "sepbase",
        nameRules: { minLength: 1, maxLength: 32, allowedYears: [1, 2, 3, 4, 5] },
        settlement,
      },
    });
    const result = await handlers(mock).prepareRegistration({
      label: "Alice.sepbase",
      durationYears: 2,
      recipient,
      referrer,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      chainId: 84532,
      to: contract,
      functionName: "register",
      args: ["alice", 2, recipient, referrer, "2000000000000000", 1000],
      value: expectedValue.toString(),
      blockNumber: "123",
      broadcast: false,
    });
    const decoded = decodeFunctionData({
      abi: registerAbi,
      data: result.data.calldata as `0x${string}`,
    });
    expect(decoded.functionName).toBe("register");
    expect(decoded.args).toEqual([
      "alice",
      2,
      recipient,
      referrer,
      2_000_000_000_000_000n,
      1000,
    ]);
    expect(mock.publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "quote",
      blockNumber: 123n,
    }));
  });

  it("fails closed instead of producing calldata for a non-registerable name", async () => {
    const mock = client({
      getNameState: vi.fn(async () => ({
        lifecycle: "active" as const,
        reserved: false,
        available: false,
        registrationsPaused: false,
        solvent: true,
        canRegister: false,
        blockNumber: 123n,
      })),
    });

    const result = await handlers(mock).prepareRegistration({
      label: "alice",
      durationYears: 1,
      recipient,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "REGISTRATION_NOT_READY",
        message: "The name cannot currently be registered.",
        details: expect.objectContaining({ lifecycle: "active", blockNumber: "123" }),
      },
    });
    expect(mock.publicClient.readContract).not.toHaveBeenCalled();
  });

  it("uses zero referrer and zero expected BPS when referral is absent", async () => {
    const result = await handlers(client()).prepareRegistration({
      label: "alice",
      durationYears: 1,
      recipient,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.args).toEqual([
      "alice",
      1,
      recipient,
      zeroAddress,
      "2000000000000000",
      0,
    ]);
  });

  it.each([zeroAddress, contract])("rejects an unusable registration recipient: %s", async (address) => {
    const result = await handlers(client()).prepareRegistration({
      label: "alice",
      durationYears: 1,
      recipient: address,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "INVALID_INPUT" }),
    });
  });
});
