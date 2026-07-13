import {
  InvalidInputError,
  RpcUnavailableError,
  SepbaseError,
  isValidLabel,
  normalizeLabel,
  type SepbaseClient,
} from "@sepbase/sdk";
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
} from "viem";

export type RegistrationYears = 1 | 2 | 3 | 4 | 5;

export type StableMcpErrorCode =
  | "INVALID_INPUT"
  | "NOT_DEPLOYED"
  | "MANIFEST_UNAVAILABLE"
  | "MANIFEST_MISMATCH"
  | "UNSUPPORTED_SCHEMA"
  | "ABI_UNAVAILABLE"
  | "RPC_UNAVAILABLE"
  | "REGISTRATION_NOT_READY"
  | "OPERATION_NOT_READY"
  | "INTERNAL_ERROR";

export type StableMcpError = {
  code: StableMcpErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: StableMcpError };

class ToolOperationError extends Error {
  constructor(
    readonly code: StableMcpErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolOperationError";
  }
}

const stableSepbaseMessages: Readonly<Record<string, string>> = {
  ABI_UNAVAILABLE: "The verified contract ABI could not be loaded.",
  MANIFEST_MISMATCH: "Deployment manifest verification failed.",
  MANIFEST_UNAVAILABLE: "The deployment manifest could not be loaded.",
  NOT_DEPLOYED: "The name-service contract has not been deployed for this manifest.",
  RPC_UNAVAILABLE: "The configured chain RPC could not complete this read.",
  UNSUPPORTED_SCHEMA: "The deployment manifest schema is not supported.",
};

export function toStableMcpError(error: unknown): StableMcpError {
  if (error instanceof ToolOperationError) {
    return error.details
      ? { code: error.code, message: error.message, details: error.details }
      : { code: error.code, message: error.message };
  }
  if (error instanceof InvalidInputError) {
    return { code: "INVALID_INPUT", message: error.message };
  }
  if (error instanceof SepbaseError) {
    if (error.status === 404 || error.status === 409) {
      return {
        code: "OPERATION_NOT_READY",
        message: "The requested on-chain operation is not currently available.",
      };
    }
    const code = error.code in stableSepbaseMessages
      ? error.code as StableMcpErrorCode
      : "INTERNAL_ERROR";
    return {
      code,
      message: stableSepbaseMessages[error.code] ?? "The SEPBASE read could not be completed.",
    };
  }
  return { code: "INTERNAL_ERROR", message: "The SEPBASE tool could not complete the request." };
}

async function execute(operation: () => Promise<Record<string, unknown>>): Promise<ToolOutcome> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: toStableMcpError(error) };
  }
}

function canonicalName(client: SepbaseClient, input: string) {
  const label = normalizeLabel(input, client.manifest.suffix);
  if (!isValidLabel(label, client.manifest.nameRules)) {
    throw new InvalidInputError("Label does not satisfy the configured deployment name rules.");
  }
  return {
    label,
    fullName: `${label}.${client.manifest.suffix}`,
    tokenId: BigInt(keccak256(toBytes(label))),
  };
}

function canonicalAddress(input: string, field: string): Address {
  if (!isAddress(input)) throw new InvalidInputError(`${field} is not a valid EVM address.`);
  return getAddress(input);
}

function registrationYears(client: SepbaseClient, input: number): RegistrationYears {
  if (!Number.isInteger(input) || !client.manifest.nameRules.allowedYears.includes(input)) {
    throw new InvalidInputError("Duration must be one of the deployment's supported registration years.");
  }
  return input as RegistrationYears;
}

function decimalCursor(input: string | undefined): bigint {
  const value = input ?? "0";
  if (!/^\d{1,78}$/.test(value)) {
    throw new InvalidInputError("Market cursor must be a non-negative decimal integer.");
  }
  return BigInt(value);
}

function listingJson(
  listing: Awaited<ReturnType<SepbaseClient["getListing"]>>,
  decimals: number,
) {
  if (!listing) return null;
  return {
    tokenId: listing.tokenId.toString(),
    label: listing.label,
    fullName: listing.fullName,
    seller: listing.seller,
    priceBaseUnits: listing.price.toString(),
    formattedPrice: formatUnits(listing.price, decimals),
    feeBps: listing.feeBps,
    listedAt: listing.listedAt.toString(),
    expiresAt: listing.expiresAt.toString(),
    purchasable: listing.purchasable,
  };
}

async function readRegistrationGuards(
  client: SepbaseClient,
  label: string,
  years: RegistrationYears,
  blockNumber: bigint,
) {
  const contract = client.manifest.contract;
  if (!contract) {
    throw new ToolOperationError("NOT_DEPLOYED", "The name-service contract is not deployed.");
  }
  try {
    const [amount, referralRewardBps] = await Promise.all([
      client.publicClient.readContract({
        address: contract,
        abi: client.abi,
        functionName: "quote",
        args: [label, years],
        blockNumber,
      }),
      client.publicClient.readContract({
        address: contract,
        abi: client.abi,
        functionName: "referralRewardBps",
        blockNumber,
      }),
    ]);
    if (typeof amount !== "bigint" || typeof referralRewardBps !== "number") {
      throw new Error("Unexpected registration guard result.");
    }
    return { amount, referralRewardBps };
  } catch (error) {
    if (error instanceof SepbaseError) throw error;
    throw new RpcUnavailableError();
  }
}

async function readRegistrationAmount(
  client: SepbaseClient,
  label: string,
  years: RegistrationYears,
  blockNumber: bigint,
) {
  const contract = client.manifest.contract;
  if (!contract) {
    throw new ToolOperationError("NOT_DEPLOYED", "The name-service contract is not deployed.");
  }
  try {
    const amount = await client.publicClient.readContract({
      address: contract,
      abi: client.abi,
      functionName: "quote",
      args: [label, years],
      blockNumber,
    });
    if (typeof amount !== "bigint") throw new Error("Unexpected registration quote result.");
    return amount;
  } catch (error) {
    if (error instanceof SepbaseError) throw error;
    throw new RpcUnavailableError();
  }
}

export type SepbaseToolHandlers = ReturnType<typeof createSepbaseToolHandlers>;

export function createSepbaseToolHandlers(getClient: () => Promise<SepbaseClient>) {
  return {
    resolveName: (input: { label: string; expectedAddress?: string | undefined }) => execute(async () => {
      const client = await getClient();
      const name = canonicalName(client, input.label);
      const expectedAddress = input.expectedAddress
        ? canonicalAddress(input.expectedAddress, "Expected address")
        : undefined;
      const verification = await client.verifyName(name.label, expectedAddress);
      const effective = verification.lifecycle === "active" || verification.lifecycle === "grace";
      const resolvedAddress = effective ? verification.resolvedAddress : null;
      return {
        label: name.label,
        fullName: name.fullName,
        tokenId: name.tokenId.toString(),
        lifecycle: verification.lifecycle,
        owner: effective ? verification.owner : null,
        resolvedAddress,
        expiresAt: verification.expiresAt?.toString() ?? null,
        identityVerified: resolvedAddress !== null && verification.verified,
        verificationReason: verification.reason,
        blockNumber: verification.blockNumber.toString(),
      };
    }),

    reverseResolve: (input: { address: string }) => execute(async () => {
      const client = await getClient();
      const address = canonicalAddress(input.address, "Address");
      const identity = await client.verifyAddress(address);
      return {
        address: identity.account,
        primaryName: identity.primaryName,
        label: identity.label,
        tokenId: identity.tokenId?.toString() ?? null,
        lifecycle: identity.lifecycle,
        owner: identity.owner,
        resolvedAddress: identity.resolvedAddress,
        expiresAt: identity.expiresAt?.toString() ?? null,
        verified: identity.verified,
        verificationReason: identity.reason,
        blockNumber: identity.blockNumber.toString(),
      };
    }),

    checkAvailability: (input: { label: string }) => execute(async () => {
      const client = await getClient();
      const name = canonicalName(client, input.label);
      const state = await client.getNameState(name.label);
      return {
        label: name.label,
        fullName: name.fullName,
        tokenId: name.tokenId.toString(),
        lifecycle: state.lifecycle,
        reserved: state.reserved,
        available: state.available,
        registrationsPaused: state.registrationsPaused,
        solvent: state.solvent,
        canRegister: state.canRegister,
        blockNumber: state.blockNumber.toString(),
      };
    }),

    nameInfo: (input: { label: string }) => execute(async () => {
      const client = await getClient();
      const name = canonicalName(client, input.label);
      const state = await client.getNameState(name.label);
      const [verification, profile, listing, settlement] = await Promise.all([
        client.verifyName(name.label, undefined, { blockNumber: state.blockNumber }),
        client.getNameProfile(name.label, { blockNumber: state.blockNumber }),
        client.getListing(name.tokenId, { blockNumber: state.blockNumber }),
        client.getSettlementAsset(),
      ]);
      const effective = verification.lifecycle === "active" || verification.lifecycle === "grace";
      const resolvedAddress = effective ? verification.resolvedAddress : null;
      return {
        label: name.label,
        fullName: name.fullName,
        tokenId: name.tokenId.toString(),
        lifecycle: state.lifecycle,
        reserved: state.reserved,
        available: state.available,
        canRegister: state.canRegister,
        owner: effective ? verification.owner : null,
        resolvedAddress,
        expiresAt: effective ? verification.expiresAt?.toString() ?? null : null,
        profile,
        listing: listingJson(listing, settlement.decimals),
        identityVerified: effective && resolvedAddress !== null && verification.verified,
        verificationReason: verification.reason,
        blockNumber: state.blockNumber.toString(),
      };
    }),

    quoteRegistration: (input: { label: string; durationYears: number }) => execute(async () => {
      const client = await getClient();
      const name = canonicalName(client, input.label);
      const years = registrationYears(client, input.durationYears);
      const [state, settlement] = await Promise.all([
        client.getNameState(name.label),
        client.getSettlementAsset(),
      ]);
      const amount = await readRegistrationAmount(client, name.label, years, state.blockNumber);
      return {
        label: name.label,
        fullName: name.fullName,
        durationYears: years,
        quoteBaseUnits: amount.toString(),
        formattedQuote: formatUnits(amount, settlement.decimals),
        settlement,
        lifecycle: state.lifecycle,
        available: state.available,
        canRegister: state.canRegister,
        blockNumber: state.blockNumber.toString(),
      };
    }),

    marketListings: (input: { cursor?: string | undefined; limit?: number | undefined }) => execute(async () => {
      const client = await getClient();
      const cursor = decimalCursor(input.cursor);
      const limit = input.limit ?? 24;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new InvalidInputError("Market limit must be an integer from 1 to 50.");
      }
      const [page, settlement] = await Promise.all([
        client.getActiveListings(cursor, limit),
        client.getSettlementAsset(),
      ]);
      return {
        items: page.items.map((listing) => listingJson(listing, settlement.decimals)),
        marketplacePaused: page.marketplacePaused,
        solvent: page.solvent,
        blockNumber: page.blockNumber.toString(),
        nextCursor: page.nextCursor?.toString() ?? null,
        hasMore: page.hasMore,
        scanned: page.scanned,
        settlement,
      };
    }),

    protocolHealth: () => execute(async () => {
      const client = await getClient();
      const [health, settlement] = await Promise.all([
        client.getProtocolHealth(),
        client.getSettlementAsset(),
      ]);
      const surplus = health.solvent ? health.settlementBalance - health.protectedLiability : 0n;
      const shortfall = health.solvent ? 0n : health.protectedLiability - health.settlementBalance;
      return {
        chainId: client.manifest.chainId,
        chainName: client.manifest.chainName,
        contract: client.manifest.contract,
        settlement,
        settlementBalanceBaseUnits: health.settlementBalance.toString(),
        protectedLiabilityBaseUnits: health.protectedLiability.toString(),
        treasurySurplusBaseUnits: surplus.toString(),
        shortfallBaseUnits: shortfall.toString(),
        formattedSettlementBalance: formatUnits(health.settlementBalance, settlement.decimals),
        solvent: health.solvent,
        blockNumber: health.blockNumber.toString(),
      };
    }),

    prepareRegistration: (input: {
      label: string;
      durationYears: number;
      recipient: string;
      referrer?: string | undefined;
    }) => execute(async () => {
      const client = await getClient();
      const name = canonicalName(client, input.label);
      const years = registrationYears(client, input.durationYears);
      const recipient = canonicalAddress(input.recipient, "Recipient");
      if (recipient === zeroAddress) {
        throw new InvalidInputError("Recipient cannot be the zero address.");
      }
      if (client.manifest.contract
        && recipient.toLowerCase() === client.manifest.contract.toLowerCase()) {
        throw new InvalidInputError("Recipient cannot be the name-service contract.");
      }
      const referrer = input.referrer
        ? canonicalAddress(input.referrer, "Referrer")
        : zeroAddress;
      if (referrer !== zeroAddress && referrer.toLowerCase() === recipient.toLowerCase()) {
        throw new InvalidInputError("Referrer cannot be the registration recipient.");
      }

      const state = await client.getNameState(name.label);
      if (!state.canRegister) {
        throw new ToolOperationError(
          "REGISTRATION_NOT_READY",
          "The name cannot currently be registered.",
          {
            lifecycle: state.lifecycle,
            available: state.available,
            reserved: state.reserved,
            registrationsPaused: state.registrationsPaused,
            solvent: state.solvent,
            blockNumber: state.blockNumber.toString(),
          },
        );
      }

      const { amount, referralRewardBps } = await readRegistrationGuards(
        client,
        name.label,
        years,
        state.blockNumber,
      );
      const expectedReferralRewardBps = referrer === zeroAddress ? 0 : referralRewardBps;
      const contract = client.manifest.contract;
      if (!contract) {
        throw new ToolOperationError("NOT_DEPLOYED", "The name-service contract is not deployed.");
      }
      const orderedArgs = [
        name.label,
        years,
        recipient,
        referrer,
        amount,
        expectedReferralRewardBps,
      ] as const;
      let calldata: `0x${string}`;
      try {
        calldata = encodeFunctionData({
          abi: client.abi,
          functionName: "register",
          args: orderedArgs,
        });
      } catch {
        throw new ToolOperationError(
          "MANIFEST_MISMATCH",
          "The verified ABI cannot encode the registration call.",
        );
      }
      const value = client.manifest.settlement.kind === "native" ? amount : 0n;
      return {
        chainId: client.manifest.chainId,
        to: contract,
        functionName: "register",
        argNames: [
          "label",
          "durationYears",
          "recipient",
          "referrer",
          "expectedAmount",
          "expectedReferralRewardBps",
        ],
        args: [
          name.label,
          years,
          recipient,
          referrer,
          amount.toString(),
          expectedReferralRewardBps,
        ],
        calldata,
        value: value.toString(),
        blockNumber: state.blockNumber.toString(),
        settlement: client.manifest.settlement,
        broadcast: false,
      };
    }),
  };
}
