import { getAddress, keccak256, toBytes, type Address } from "viem";
import { serverContract, serverPublicClient } from "@/lib/contract/server";
import { quoteTtlSeconds } from "./config";
import { X402RegistrationError } from "./errors";
import { buildRegistrationQuote, type RegistrationQuoteScope } from "./quote";
import { quoteAuthenticatorFromEnvironment } from "./quote-auth";
import type { LiveRegistrationState, RegistrationQuoteInput } from "./types";
import {
  legacyV2RegistrationQuoteScope,
  legacyV2X402,
} from "./legacy-v2-adapter";

export function registrationQuoteScope(): RegistrationQuoteScope {
  if (!legacyV2X402.protocolAddress) {
    throw new X402RegistrationError(503, "NOT_DEPLOYED", "The protocol deployment is not available.");
  }
  return {
    ...legacyV2RegistrationQuoteScope(),
  };
}

export async function readLiveRegistrationState(
  input: Pick<RegistrationQuoteInput, "label" | "durationYears">,
): Promise<LiveRegistrationState> {
  if (!serverContract) {
    throw new X402RegistrationError(503, "NOT_DEPLOYED", "The protocol deployment is not available.");
  }
  const tokenId = BigInt(keccak256(toBytes(input.label)));
  const blockNumber = await serverPublicClient.getBlockNumber();
  const [available, reserved, status, amount, registrationsPaused, solvent, referralRewardBps]
    = await serverPublicClient.multicall({
      allowFailure: false,
      blockNumber,
      contracts: [
        { ...serverContract, functionName: "isAvailable", args: [input.label] },
        { ...serverContract, functionName: "reservedLabels", args: [keccak256(toBytes(input.label))] },
        { ...serverContract, functionName: "statusOf", args: [tokenId] },
        { ...serverContract, functionName: "quote", args: [input.label, input.durationYears] },
        { ...serverContract, functionName: "registrationsPaused" },
        { ...serverContract, functionName: "isSolvent" },
        { ...serverContract, functionName: "referralRewardBps" },
      ],
    });

  return {
    tokenId,
    blockNumber,
    available,
    reserved,
    status,
    amount,
    registrationsPaused,
    solvent,
    referralRewardBps,
  };
}

export async function issueLiveRegistrationQuote(
  input: RegistrationQuoteInput,
  options: { nowSeconds?: number; environment?: Record<string, string | undefined> } = {},
) {
  const environment = options.environment ?? process.env;
  const authenticator = quoteAuthenticatorFromEnvironment(environment);
  const live = await readLiveRegistrationState(input);
  return buildRegistrationQuote({
    input,
    live,
    scope: registrationQuoteScope(),
    nowSeconds: options.nowSeconds ?? Math.floor(Date.now() / 1_000),
    ttlSeconds: quoteTtlSeconds(environment),
    authenticator,
  });
}

export function configuredProtocolAddress(): Address | null {
  return legacyV2X402.protocolAddress ? getAddress(legacyV2X402.protocolAddress) : null;
}
