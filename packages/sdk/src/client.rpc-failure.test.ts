import { beforeEach, describe, expect, it, vi } from "vitest";
import manifestFixture from "../../../apps/web/public/deployment-manifest.json";

const contractMocks = vi.hoisted(() => ({
  createContractContext: vi.fn(),
}));

vi.mock("./contract", () => ({
  createContractContext: contractMocks.createContractContext,
}));

import { createSepbaseClient } from "./client";

const success = (result: unknown) => ({ status: "success" as const, result });
const failure = { status: "failure" as const, error: new Error("rpc failed") };

function mockedContext() {
  const publicClient = {
    getBlockNumber: vi.fn(async () => 123n),
    multicall: vi.fn(),
  };
  contractMocks.createContractContext.mockResolvedValue({
    abi: [],
    chain: { id: manifestFixture.chainId },
    manifest: manifestFixture,
    origin: new URL("https://names.example/.well-known/chain-name-service.json"),
    publicClient,
  });
  return publicClient;
}

describe("fail-closed partial contract reads", () => {
  beforeEach(() => {
    contractMocks.createContractContext.mockReset();
  });

  it("does not turn a failed pause read into an open registration state", async () => {
    const rpc = mockedContext();
    rpc.multicall.mockResolvedValue([
      success(0),
      success(false),
      success(true),
      failure,
      success(true),
    ]);
    const client = await createSepbaseClient("https://names.example/manifest.json");

    await expect(client.getNameState("alice")).rejects.toMatchObject({
      code: "RPC_UNAVAILABLE",
      message: expect.stringContaining("registration pause"),
    });
  });

  it("does not return a null profile when an active-name profile read failed", async () => {
    const rpc = mockedContext();
    rpc.multicall.mockResolvedValue([success(1), failure]);
    const client = await createSepbaseClient("https://names.example/manifest.json");

    await expect(client.getNameProfile("alice")).rejects.toMatchObject({
      code: "RPC_UNAVAILABLE",
      message: expect.stringContaining("active name profile"),
    });
  });

  it("does not classify an active identity when owner resolution failed", async () => {
    const rpc = mockedContext();
    rpc.multicall.mockResolvedValue([
      success(1),
      failure,
      success("0x1111111111111111111111111111111111111111"),
      success("alice.sepbase"),
      success(1_900_000_000n),
    ]);
    const client = await createSepbaseClient("https://names.example/manifest.json");

    await expect(client.verifyName("alice")).rejects.toMatchObject({
      code: "RPC_UNAVAILABLE",
      message: expect.stringContaining("name owner"),
    });
  });

  it("keeps expected ownerOf reverts non-fatal for an unregistered name", async () => {
    const rpc = mockedContext();
    rpc.multicall.mockResolvedValue([success(0), failure, failure, failure, failure]);
    const client = await createSepbaseClient("https://names.example/manifest.json");

    await expect(client.verifyName("alice")).resolves.toMatchObject({
      verified: false,
      owner: null,
      resolvedAddress: null,
    });
  });
});
