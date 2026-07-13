import {
  assertLegacyV2MigrationLabel,
  InvalidInputError,
  NameNormalizationError,
  RpcUnavailableError,
  type NormalizedName,
  type SepbaseV3Client,
  type V3Auction,
  type V3Liabilities,
  type V3Listing,
  type V3NameRecord,
  type V3Offer,
  type V3TransactionPlan,
} from "@sepbase/sdk";
import {
  formatUnits,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import {
  toStableMcpError,
  type StableMcpError,
  type ToolOutcome,
} from "./tools.js";

export type V3RegistrationYears = 1 | 2 | 3 | 4 | 5;

const decimalUintPattern = /^(0|[1-9][0-9]{0,77})$/;
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, jsonSafe(entry)]),
    );
  }
  return value;
}

function stableV3Error(error: unknown): StableMcpError {
  if (error instanceof NameNormalizationError) {
    const details = error.normalizedSuggestion
      ? { normalizedSuggestion: error.normalizedSuggestion }
      : undefined;
    return details
      ? { code: "INVALID_INPUT", message: error.message, details }
      : { code: "INVALID_INPUT", message: error.message };
  }
  return toStableMcpError(error);
}

async function executeV3(
  operation: () => Promise<Record<string, unknown>>,
): Promise<ToolOutcome> {
  try {
    return {
      ok: true,
      data: jsonSafe(await operation()) as Record<string, unknown>,
    };
  } catch (error) {
    const stable = stableV3Error(error);
    return {
      ok: false,
      error: jsonSafe(stable) as StableMcpError,
    };
  }
}

function decimalUint(input: string, field: string, positive = false) {
  if (!decimalUintPattern.test(input)) {
    throw new InvalidInputError(`${field} must be a non-negative decimal integer.`);
  }
  const value = BigInt(input);
  if (positive && value === 0n) {
    throw new InvalidInputError(`${field} must be positive.`);
  }
  return value;
}

function pageInput(input: { cursor?: string | undefined; limit?: number | undefined }) {
  const cursor = decimalUint(input.cursor ?? "0", "Cursor");
  const limit = input.limit ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new InvalidInputError("Page limit must be an integer from 1 to 50.");
  }
  return { cursor, limit };
}

function durationYears(input: number): V3RegistrationYears {
  if (!Number.isInteger(input) || input < 1 || input > 5) {
    throw new InvalidInputError("Duration must be an integer from 1 to 5 years.");
  }
  return input as V3RegistrationYears;
}

function canonicalAddress(input: string, field: string, allowZero = false): Address {
  if (!isAddress(input)) throw new InvalidInputError(`${field} is not a valid EVM address.`);
  const address = getAddress(input);
  if (!allowZero && /^0x0{40}$/i.test(address)) {
    throw new InvalidInputError(`${field} cannot be the zero address.`);
  }
  return address;
}

function bytes32(input: string, field: string): Hex {
  if (!bytes32Pattern.test(input)) throw new InvalidInputError(`${field} must be bytes32 hex.`);
  return input.toLowerCase() as Hex;
}

function legacyAsciiLabel(client: SepbaseV3Client, input: string) {
  const label = assertLegacyV2MigrationLabel(input);
  const normalized = client.normalize(label);
  if (normalized.changed || normalized.normalizedLabel !== label) {
    throw new InvalidInputError("Legacy migration label bytes differ from the V3 canonical identity.");
  }
  return label;
}

function normalizedJson(name: NormalizedName) {
  return {
    rawInput: name.rawInput,
    label: name.normalizedLabel,
    fullName: name.normalizedFullName,
    suffix: name.suffix,
    labelHash: name.labelHash,
    node: name.node,
    tokenId: name.tokenId,
    codePointLength: name.codePointLength,
    utf8ByteLength: name.utf8ByteLength,
    changed: name.changed,
  };
}

function suiteJson(client: SepbaseV3Client) {
  return {
    schemaVersion: client.manifest.schemaVersion,
    suiteVersion: client.manifest.suiteVersion,
    suiteReleaseId: client.manifest.suiteReleaseId,
    releaseStatus: client.manifest.releaseStatus,
    chainId: client.manifest.chainId,
    chainName: client.manifest.chainName,
    suffix: client.manifest.suffix,
  };
}

function settlementJson(client: SepbaseV3Client) {
  return {
    kind: client.manifest.settlement.kind,
    tokenAddress: client.manifest.settlement.tokenAddress,
    name: client.manifest.settlement.name,
    symbol: client.manifest.settlement.symbol,
    decimals: client.manifest.settlement.decimals,
  };
}

function nameRecordJson(record: V3NameRecord) {
  const effective = record.status === "active" || record.status === "grace";
  return {
    label: record.label,
    fullName: record.fullName,
    node: record.node,
    tokenId: record.tokenId,
    status: record.status,
    owner: effective ? record.owner : null,
    resolvedAddress: effective ? record.resolvedAddress : null,
    expiresAt: record.expiresAt,
    available: record.available,
    reserved: record.reserved,
    transferNonce: record.transferNonce,
    blockNumber: record.blockNumber,
  };
}

function listingJson(client: SepbaseV3Client, listing: V3Listing) {
  return {
    tokenId: listing.tokenId,
    seller: listing.seller,
    priceBaseUnits: listing.price,
    formattedPrice: formatUnits(listing.price, client.manifest.settlement.decimals),
    deadline: listing.deadline,
    transferNonce: listing.transferNonce,
    listingNonce: listing.listingNonce,
    feeBps: listing.feeBps,
  };
}

function offerJson(client: SepbaseV3Client, offer: V3Offer) {
  return {
    offerId: offer.offerId,
    tokenId: offer.tokenId,
    buyer: offer.buyer,
    recipient: offer.recipient,
    ownerSnapshot: offer.ownerSnapshot,
    amountBaseUnits: offer.amount,
    formattedAmount: formatUnits(offer.amount, client.manifest.settlement.decimals),
    deadline: offer.deadline,
    transferNonce: offer.transferNonce,
    feeBps: offer.feeBps,
    state: offer.state,
    stale: offer.stale,
  };
}

function auctionJson(client: SepbaseV3Client, auction: V3Auction) {
  return {
    tokenId: auction.tokenId,
    seller: auction.seller,
    highestBidder: auction.highestBidder,
    highestBidRecipient: auction.highestBidRecipient,
    reservePriceBaseUnits: auction.reservePrice,
    formattedReservePrice: formatUnits(auction.reservePrice, client.manifest.settlement.decimals),
    highestBidBaseUnits: auction.highestBid,
    formattedHighestBid: formatUnits(auction.highestBid, client.manifest.settlement.decimals),
    startAt: auction.startAt,
    endAt: auction.endAt,
    hardEndAt: auction.hardEndAt,
    transferNonce: auction.transferNonce,
    auctionNonce: auction.auctionNonce,
    feeBps: auction.feeBps,
    extensionsUsed: auction.extensionsUsed,
  };
}

function liabilitiesJson(client: SepbaseV3Client, liabilities: V3Liabilities) {
  const decimals = client.manifest.settlement.decimals;
  return {
    controllerProtectedBalanceBaseUnits: liabilities.controllerProtectedBalance,
    formattedControllerProtectedBalance: formatUnits(liabilities.controllerProtectedBalance, decimals),
    referralLiabilityBaseUnits: liabilities.referralLiability,
    formattedReferralLiability: formatUnits(liabilities.referralLiability, decimals),
    marketplaceProtectedBalanceBaseUnits: liabilities.marketplaceProtectedBalance,
    formattedMarketplaceProtectedBalance: formatUnits(liabilities.marketplaceProtectedBalance, decimals),
    claimableLiabilityBaseUnits: liabilities.claimableLiability,
    offerEscrowBaseUnits: liabilities.offerEscrow,
    auctionEscrowBaseUnits: liabilities.auctionEscrow,
    suiteProtectedBalanceBaseUnits: liabilities.suiteProtectedBalance,
    formattedSuiteProtectedBalance: formatUnits(liabilities.suiteProtectedBalance, decimals),
    suiteSettlementBalanceBaseUnits: liabilities.suiteSettlementBalance,
    formattedSuiteSettlementBalance: formatUnits(liabilities.suiteSettlementBalance, decimals),
    controllerSolvent: liabilities.controllerSolvent,
    marketplaceSolvent: liabilities.marketplaceSolvent,
    suiteSolvent: liabilities.suiteSolvent,
    blockNumber: liabilities.blockNumber,
  };
}

function transactionPlanJson(client: SepbaseV3Client, plan: V3TransactionPlan) {
  return {
    planType: "unsigned-guarded-transaction",
    suite: suiteJson(client),
    settlement: settlementJson(client),
    transaction: {
      chainId: plan.chainId,
      expectedSender: plan.expectedSender,
      to: plan.to,
      functionName: plan.functionName,
      calldata: plan.data,
      nativeValueBaseUnits: plan.value,
      formattedNativeValue: formatUnits(plan.value, client.manifest.nativeCurrency.decimals),
      blockNumber: plan.blockNumber,
    },
    settlementApproval: plan.settlementApproval
      ? {
          token: plan.settlementApproval.token,
          spender: plan.settlementApproval.spender,
          amountBaseUnits: plan.settlementApproval.amount,
          formattedAmount: formatUnits(
            plan.settlementApproval.amount,
            client.manifest.settlement.decimals,
          ),
          calldata: plan.settlementApproval.data,
        }
      : null,
    safety: {
      statePinnedAtBlock: plan.blockNumber,
      walletReviewAndSimulationRequired: true,
      serverCanSign: false,
      serverCanSendTransaction: false,
      serverCanStartPayment: false,
    },
  };
}

export type SepbaseV3ToolHandlers = ReturnType<typeof createSepbaseV3ToolHandlers>;

export function createSepbaseV3ToolHandlers(
  getClient: () => Promise<SepbaseV3Client>,
) {
  const withPlan = (
    operation: (client: SepbaseV3Client) => Promise<V3TransactionPlan>,
  ) => executeV3(async () => {
    const client = await getClient();
    return transactionPlanJson(client, await operation(client));
  });

  return {
    normalize: (input: { name: string }) => executeV3(async () => {
      const client = await getClient();
      return {
        suite: suiteJson(client),
        name: normalizedJson(client.normalize(input.name)),
      };
    }),

    nameInfo: (input: { name: string }) => executeV3(async () => {
      const client = await getClient();
      const record = await client.getNameRecord(input.name);
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        name: nameRecordJson(record),
      };
    }),

    resolveName: (input: { name: string }) => executeV3(async () => {
      const client = await getClient();
      const record = await client.getNameRecord(input.name);
      const effective = record.status === "active" || record.status === "grace";
      return {
        suite: suiteJson(client),
        label: record.label,
        fullName: record.fullName,
        status: record.status,
        owner: effective ? record.owner : null,
        resolvedAddress: effective ? record.resolvedAddress : null,
        verified: effective && record.owner !== null && record.resolvedAddress !== null,
        blockNumber: record.blockNumber,
      };
    }),

    resolveText: (input: { name: string; key: string }) => executeV3(async () => {
      const client = await getClient();
      const record = await client.getNameRecord(input.name);
      const effective = record.status === "active" || record.status === "grace";
      const value = effective
        ? await client.resolveText(record.label, input.key, record.blockNumber)
        : null;
      return {
        suite: suiteJson(client),
        label: record.label,
        fullName: record.fullName,
        key: input.key,
        value,
        status: record.status,
        effective,
        blockNumber: record.blockNumber,
      };
    }),

    reverse: (input: { address: string }) => executeV3(async () => {
      const client = await getClient();
      const account = canonicalAddress(input.address, "Account");
      const blockNumber = await client.publicClient.getBlockNumber();
      const reverse = await client.reverseResolve(account, blockNumber);
      const record = reverse.name
        ? await client.getNameRecord(reverse.name, blockNumber)
        : null;
      const effective = record?.status === "active" || record?.status === "grace";
      const verified = Boolean(
        reverse.verified
        && effective
        && record?.owner?.toLowerCase() === account.toLowerCase()
        && record.resolvedAddress?.toLowerCase() === account.toLowerCase(),
      );
      return {
        suite: suiteJson(client),
        address: account,
        primaryName: verified ? reverse.name : null,
        verified,
        verificationReason: verified
          ? "forward-owner-confirmed"
          : reverse.name
            ? "forward-or-owner-mismatch"
            : "no-primary-name",
        blockNumber,
      };
    }),

    ownedNames: (input: {
      account: string;
      cursor?: string | undefined;
      limit?: number | undefined;
    }) => executeV3(async () => {
      const client = await getClient();
      const account = canonicalAddress(input.account, "Account");
      const page = pageInput(input);
      const result = await client.getOwnedNames(account, page.cursor, page.limit);
      return {
        suite: suiteJson(client),
        account,
        items: result.items.map(nameRecordJson),
        total: result.total,
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        blockNumber: result.blockNumber,
      };
    }),

    accountBalances: (input: { account: string }) => executeV3(async () => {
      const client = await getClient();
      const account = canonicalAddress(input.account, "Account");
      const result = await client.getAccountBalances(account);
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        account,
        referralRewardsBaseUnits: result.referralRewards,
        formattedReferralRewards: formatUnits(result.referralRewards, client.manifest.settlement.decimals),
        marketplaceClaimableBaseUnits: result.marketplaceClaimable,
        formattedMarketplaceClaimable: formatUnits(result.marketplaceClaimable, client.manifest.settlement.decimals),
        primary: result.primary,
        blockNumber: result.blockNumber,
      };
    }),

    quoteRegistration: (input: { name: string; durationYears: number }) => executeV3(async () => {
      const client = await getClient();
      const normalized = client.normalize(input.name);
      const years = durationYears(input.durationYears);
      const record = await client.getNameRecord(normalized.normalizedLabel);
      const amount = await client.quoteRegistration(
        normalized.normalizedLabel,
        years,
        record.blockNumber,
      );
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        name: normalizedJson(normalized),
        durationYears: years,
        quoteBaseUnits: amount,
        formattedQuote: formatUnits(amount, client.manifest.settlement.decimals),
        status: record.status,
        available: record.available,
        reserved: record.reserved,
        blockNumber: record.blockNumber,
      };
    }),

    registrationRequirements: (input: {
      name: string;
      durationYears: number;
      recipient: string;
    }) => executeV3(async () => {
      const client = await getClient();
      const normalized = client.normalize(input.name);
      const years = durationYears(input.durationYears);
      const recipient = canonicalAddress(input.recipient, "Recipient");
      const record = await client.getNameRecord(normalized.normalizedLabel);
      const amount = await client.quoteRegistration(
        normalized.normalizedLabel,
        years,
        record.blockNumber,
      );
      const controller = client.contracts.controller.address;
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        name: normalizedJson(normalized),
        registration: {
          recipient,
          durationYears: years,
          expectedAmountBaseUnits: amount,
          formattedExpectedAmount: formatUnits(amount, client.manifest.settlement.decimals),
          expectedReferralRewardBps: client.manifest.pricing.referralRewardBps,
          controller,
          blockNumber: record.blockNumber,
        },
        normalizationAttestation: {
          attestor: client.manifest.normalization.attestor,
          profileId: client.manifest.normalization.profileId,
          profileHash: client.manifest.normalization.profileHash,
          maximumValiditySeconds: client.manifest.normalization.maxAttestationValiditySeconds,
          typedData: {
            domain: {
              name: "ChainNameControllerV3",
              version: "3",
              chainId: client.manifest.chainId,
              verifyingContract: controller,
            },
            primaryType: "NormalizationAttestation",
            fields: [
              { name: "chainId", type: "uint256", value: client.manifest.chainId },
              { name: "controller", type: "address", value: controller },
              {
                name: "normalizationProfileHash",
                type: "bytes32",
                value: client.manifest.normalization.profileHash,
              },
              { name: "labelHash", type: "bytes32", value: normalized.labelHash },
              { name: "recipient", type: "address", value: recipient },
              { name: "validUntil", type: "uint64", value: null },
            ],
          },
        },
        commitment: {
          minimumAgeSeconds: client.manifest.commitment.minAgeSeconds,
          maximumAgeSeconds: client.manifest.commitment.maxAgeSeconds,
          controllerFunction: "makeCommitment",
          orderedFields: [
            "node",
            "payer",
            "recipient",
            "durationYears",
            "resolverInitializationHash",
            "normalizationAttestationHash",
            "referrer",
            "clientGeneratedRandomness",
            "expectedAmount",
            "expectedReferralRewardBps",
          ],
          clientGeneratedRandomness: "32-byte local value; never submit it to this MCP server",
        },
        x402: {
          quoteEndpoint: new URL(client.manifest.endpoints.x402Quote, client.origin).href,
          registrationEndpoint: new URL(client.manifest.endpoints.x402Registration, client.origin).href,
          paidExecutionAvailable: client.manifest.x402.paidExecutionAvailable,
          network: client.manifest.x402.network,
          scheme: client.manifest.x402.scheme,
          instruction: client.manifest.x402.paidExecutionAvailable
            ? "Use the configured x402 registration endpoint for any reviewed paid execution flow."
            : "Paid execution is unavailable; only the configured x402 quote/readiness endpoint may be used.",
        },
        mcpBoundary: {
          mode: "requirements-only",
          preparesRegistrationCommit: false,
          preparesRegistrationReveal: false,
          acceptsAttestorOutput: false,
          acceptsWalletCredentials: false,
          acceptsX402Authorization: false,
          signsTransactions: false,
          sendsTransactions: false,
        },
      };
    }),

    listings: (input: { cursor?: string | undefined; limit?: number | undefined }) => executeV3(async () => {
      const client = await getClient();
      const page = pageInput(input);
      const result = await client.getListings(page.cursor, page.limit);
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        items: result.items.map((item) => listingJson(client, item)),
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        blockNumber: result.blockNumber,
      };
    }),

    globalOffers: (input: {
      cursor?: string | undefined;
      limit?: number | undefined;
      includeTerminal?: boolean | undefined;
    }) => executeV3(async () => {
      const client = await getClient();
      const page = pageInput(input);
      const result = await client.getGlobalOffers(
        page.cursor,
        page.limit,
        input.includeTerminal ?? false,
      );
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        items: result.items.map((item) => offerJson(client, item)),
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        includeTerminal: input.includeTerminal ?? false,
        blockNumber: result.blockNumber,
      };
    }),

    buyerOffers: (input: {
      buyer: string;
      cursor?: string | undefined;
      limit?: number | undefined;
      includeTerminal?: boolean | undefined;
    }) => executeV3(async () => {
      const client = await getClient();
      const buyer = canonicalAddress(input.buyer, "Buyer");
      const page = pageInput(input);
      const result = await client.getBuyerOffers(
        buyer,
        page.cursor,
        page.limit,
        input.includeTerminal ?? false,
      );
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        buyer,
        items: result.items.map((item) => offerJson(client, item)),
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        includeTerminal: input.includeTerminal ?? false,
        blockNumber: result.blockNumber,
      };
    }),

    ownerOffers: (input: {
      owner: string;
      cursor?: string | undefined;
      limit?: number | undefined;
      includeTerminal?: boolean | undefined;
    }) => executeV3(async () => {
      const client = await getClient();
      const owner = canonicalAddress(input.owner, "Owner");
      const page = pageInput(input);
      const result = await client.getOwnerOffers(
        owner,
        page.cursor,
        page.limit,
        input.includeTerminal ?? false,
      );
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        owner,
        items: result.items.map((item) => offerJson(client, item)),
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        includeTerminal: input.includeTerminal ?? false,
        blockNumber: result.blockNumber,
      };
    }),

    auctions: (input: { cursor?: string | undefined; limit?: number | undefined }) => executeV3(async () => {
      const client = await getClient();
      const page = pageInput(input);
      const result = await client.getAuctions(page.cursor, page.limit);
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        items: result.items.map((item) => auctionJson(client, item)),
        cursor: page.cursor,
        nextCursor: result.nextCursor,
        limit: page.limit,
        blockNumber: result.blockNumber,
      };
    }),

    liabilities: () => executeV3(async () => {
      const client = await getClient();
      const liabilities = await client.getLiabilities();
      return {
        suite: suiteJson(client),
        settlement: settlementJson(client),
        liabilities: liabilitiesJson(client, liabilities),
      };
    }),

    migrationStatus: (input: { name?: string | undefined; account?: string | undefined }) => executeV3(async () => {
      const client = await getClient();
      if (input.account && !input.name) {
        throw new InvalidInputError("Name is required when account-scoped migration eligibility is requested.");
      }
      if (input.account && input.name) {
        const account = canonicalAddress(input.account, "Account");
        const label = legacyAsciiLabel(client, input.name);
        const eligibility = await client.getMigrationEligibility({ account, legacyLabel: label });
        return {
          suite: suiteJson(client),
          migration: {
            contract: client.contracts.migration.address,
            legacyRegistry: eligibility.legacyRegistry,
            sourceChainId: eligibility.sourceChainId,
            startsAt: eligibility.migrationStartsAt,
            endsAt: eligibility.migrationEndsAt,
            phase: eligibility.phase,
            blockTimestamp: eligibility.blockTimestamp,
            blockNumber: eligibility.blockNumber,
          },
          name: {
            ...normalizedJson(client.normalize(label)),
            reservedByMigration: eligibility.reserved,
          },
          claimEligibility: {
            account: eligibility.account,
            eligible: eligibility.eligible,
            reason: eligibility.reason,
            legacyStatus: eligibility.legacyStatus,
            legacyOwner: eligibility.legacyOwner,
            legacyExpiresAt: eligibility.legacyExpiresAt,
            legacyResolution: eligibility.legacyResolution,
          },
        };
      }
      const normalized = input.name ? client.normalize(input.name) : null;
      const blockNumber = await client.publicClient.getBlockNumber();
      try {
        const migration = client.contracts.migration;
        const reads: Array<Promise<unknown>> = [
          client.publicClient.readContract({ ...migration, functionName: "migrationPaused", blockNumber }),
          client.publicClient.readContract({ ...migration, functionName: "migrationStartsAt", blockNumber }),
          client.publicClient.readContract({ ...migration, functionName: "migrationEndsAt", blockNumber }),
          client.publicClient.readContract({ ...migration, functionName: "sourceChainId", blockNumber }),
          client.publicClient.readContract({ ...migration, functionName: "legacyRegistry", blockNumber }),
        ];
        if (normalized) {
          reads.push(client.publicClient.readContract({
            ...migration,
            functionName: "isReserved",
            args: [normalized.tokenId],
            blockNumber,
          }));
        }
        const blockPromise = client.publicClient.getBlock({ blockNumber });
        const [values, block] = await Promise.all([Promise.all(reads), blockPromise]);
        const [paused, startsAt, endsAt, sourceChainId, legacyRegistry, reserved] = values;
        if (
          typeof paused !== "boolean"
          || typeof startsAt !== "bigint"
          || typeof endsAt !== "bigint"
          || typeof sourceChainId !== "bigint"
          || typeof legacyRegistry !== "string"
          || (normalized && typeof reserved !== "boolean")
        ) {
          throw new Error("Unexpected migration response.");
        }
        const phase = paused
          ? "paused"
          : block.timestamp < startsAt
            ? "not-started"
            : block.timestamp > endsAt
              ? "ended"
              : "open";
        return {
          suite: suiteJson(client),
          migration: {
            contract: migration.address,
            legacyRegistry,
            sourceChainId,
            startsAt,
            endsAt,
            paused,
            phase,
            blockTimestamp: block.timestamp,
            blockNumber,
          },
          name: normalized
            ? {
                ...normalizedJson(normalized),
                reservedByMigration: reserved,
              }
            : null,
        };
      } catch (error) {
        if (error instanceof InvalidInputError || error instanceof NameNormalizationError) throw error;
        throw new RpcUnavailableError();
      }
    }),

    prepareRenewal: (input: { owner: string; tokenId: string; durationYears: number }) => withPlan(async (client) => client.prepareRenew({
      owner: canonicalAddress(input.owner, "Owner"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
      durationYears: durationYears(input.durationYears),
    })),

    prepareMarketplaceApproval: (input: { owner: string; tokenId: string }) => withPlan(async (client) => client.prepareMarketplaceApproval({
      owner: canonicalAddress(input.owner, "Owner"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    prepareListing: (input: { seller: string; tokenId: string; price: string; deadline: string }) => withPlan(async (client) => client.prepareList({
      seller: canonicalAddress(input.seller, "Seller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
      price: decimalUint(input.price, "Listing price", true),
      deadline: decimalUint(input.deadline, "Listing deadline"),
    })),

    prepareListingUpdate: (input: { seller: string; tokenId: string; newPrice: string; newDeadline: string }) => withPlan(async (client) => client.prepareUpdateListing({
      seller: canonicalAddress(input.seller, "Seller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
      newPrice: decimalUint(input.newPrice, "New listing price", true),
      newDeadline: decimalUint(input.newDeadline, "New listing deadline"),
    })),

    prepareListingCancel: (input: { seller: string; tokenId: string }) => withPlan(async (client) => client.prepareCancelListing({
      seller: canonicalAddress(input.seller, "Seller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    prepareListingInvalidate: (input: { caller: string; tokenId: string }) => withPlan(async (client) => client.prepareInvalidateListing({
      caller: canonicalAddress(input.caller, "Caller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    prepareBuy: (input: { buyer: string; tokenId: string; recipient?: string | undefined }) => withPlan(async (client) => {
      const base = {
        buyer: canonicalAddress(input.buyer, "Buyer"),
        tokenId: decimalUint(input.tokenId, "Token ID"),
      };
      return client.prepareBuy(input.recipient
        ? { ...base, recipient: canonicalAddress(input.recipient, "Recipient") }
        : base);
    }),

    prepareOffer: (input: { buyer: string; tokenId: string; recipient?: string | undefined; amount: string; deadline: string }) => withPlan(async (client) => {
      const base = {
        buyer: canonicalAddress(input.buyer, "Buyer"),
        tokenId: decimalUint(input.tokenId, "Token ID"),
        amount: decimalUint(input.amount, "Offer amount", true),
        deadline: decimalUint(input.deadline, "Offer deadline"),
      };
      return client.prepareOffer(input.recipient
        ? { ...base, recipient: canonicalAddress(input.recipient, "Recipient") }
        : base);
    }),

    prepareOfferAccept: (input: { seller: string; offerId: string }) => withPlan(async (client) => client.prepareAcceptOffer({
      seller: canonicalAddress(input.seller, "Seller"),
      offerId: bytes32(input.offerId, "Offer ID"),
    })),

    prepareOfferCancel: (input: { buyer: string; offerId: string }) => withPlan(async (client) => client.prepareCancelOffer({
      buyer: canonicalAddress(input.buyer, "Buyer"),
      offerId: bytes32(input.offerId, "Offer ID"),
    })),

    prepareOfferInvalidate: (input: { caller: string; offerId: string }) => withPlan(async (client) => client.prepareInvalidateOffer({
      caller: canonicalAddress(input.caller, "Caller"),
      offerId: bytes32(input.offerId, "Offer ID"),
    })),

    prepareAuctionStart: (input: {
      seller: string;
      tokenId: string;
      reservePrice: string;
      startAt: string;
      endAt: string;
    }) => withPlan(async (client) => client.prepareStartAuction({
      seller: canonicalAddress(input.seller, "Seller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
      reservePrice: decimalUint(input.reservePrice, "Reserve price", true),
      startAt: decimalUint(input.startAt, "Auction start"),
      endAt: decimalUint(input.endAt, "Auction end"),
    })),

    prepareAuctionCancel: (input: { seller: string; tokenId: string }) => withPlan(async (client) => client.prepareCancelAuction({
      seller: canonicalAddress(input.seller, "Seller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    prepareBid: (input: { bidder: string; tokenId: string; recipient?: string | undefined; amount: string }) => withPlan(async (client) => {
      const base = {
        bidder: canonicalAddress(input.bidder, "Bidder"),
        tokenId: decimalUint(input.tokenId, "Token ID"),
        amount: decimalUint(input.amount, "Bid amount", true),
      };
      return client.prepareBid(input.recipient
        ? { ...base, recipient: canonicalAddress(input.recipient, "Recipient") }
        : base);
    }),

    prepareAuctionFinalize: (input: { caller: string; tokenId: string }) => withPlan(async (client) => client.prepareFinalizeAuction({
      caller: canonicalAddress(input.caller, "Caller"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    prepareMarketplaceClaim: (input: { account: string; recipient?: string | undefined }) => withPlan(async (client) => {
      const account = canonicalAddress(input.account, "Account");
      return client.prepareMarketplaceClaim(input.recipient
        ? { account, recipient: canonicalAddress(input.recipient, "Recipient") }
        : { account });
    }),

    prepareReferralClaim: (input: { account: string; recipient?: string | undefined }) => withPlan(async (client) => {
      const account = canonicalAddress(input.account, "Account");
      return client.prepareReferralClaim(input.recipient
        ? { account, recipient: canonicalAddress(input.recipient, "Recipient") }
        : { account });
    }),

    prepareTextRecord: (input: { owner: string; name: string; key: string; value: string }) => withPlan(async (client) => client.prepareSetText({
      owner: canonicalAddress(input.owner, "Owner"),
      label: client.normalize(input.name).normalizedLabel,
      key: input.key,
      value: input.value,
    })),

    prepareAddressRecord: (input: { owner: string; name: string; target: string }) => withPlan(async (client) => client.prepareSetAddress({
      owner: canonicalAddress(input.owner, "Owner"),
      label: client.normalize(input.name).normalizedLabel,
      target: canonicalAddress(input.target, "Address record", true),
    })),

    preparePrimaryName: (input: { owner: string; tokenId: string }) => withPlan(async (client) => client.prepareSetPrimary({
      owner: canonicalAddress(input.owner, "Owner"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
    })),

    preparePrimaryNameClear: (input: { owner: string }) => withPlan(async (client) => client.prepareClearPrimary({
      owner: canonicalAddress(input.owner, "Owner"),
    })),

    prepareTransfer: (input: { owner: string; recipient: string; tokenId: string; safe?: boolean | undefined }) => withPlan(async (client) => client.prepareTransfer({
      owner: canonicalAddress(input.owner, "Owner"),
      recipient: canonicalAddress(input.recipient, "Recipient"),
      tokenId: decimalUint(input.tokenId, "Token ID"),
      ...(input.safe === undefined ? {} : { safe: input.safe }),
    })),

    prepareMigrationClaim: (input: {
      caller: string;
      legacyLabel: string;
      recipient: string;
      expectedLegacyOwner: string;
      importLegacyResolution: boolean;
      expectedLegacyResolution?: string | undefined;
    }) => withPlan(async (client) => {
      if (input.importLegacyResolution && !input.expectedLegacyResolution) {
        throw new InvalidInputError(
          "Expected legacy resolution is required when importing the legacy resolution.",
        );
      }
      if (!input.importLegacyResolution && input.expectedLegacyResolution) {
        throw new InvalidInputError(
          "Expected legacy resolution is only valid when legacy resolution import is enabled.",
        );
      }
      const base = {
        caller: canonicalAddress(input.caller, "Caller"),
        legacyLabel: legacyAsciiLabel(client, input.legacyLabel),
        recipient: canonicalAddress(input.recipient, "Recipient"),
        expectedLegacyOwner: canonicalAddress(input.expectedLegacyOwner, "Expected legacy owner"),
        importLegacyResolution: input.importLegacyResolution,
      };
      return client.prepareMigrationClaim(input.expectedLegacyResolution
        ? {
            ...base,
            expectedLegacyResolution: canonicalAddress(
              input.expectedLegacyResolution,
              "Expected legacy resolution",
              true,
            ),
          }
        : base);
    }),
  };
}
