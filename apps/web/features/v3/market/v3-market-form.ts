import { getAddress, parseUnits } from "viem";
import type {
  V3ClaimKind,
  V3MarketActionIntent,
  V3MarketActionKind,
} from "./types";

export type V3MarketFormState = {
  action: V3MarketActionKind;
  tokenId: string;
  offerId: string;
  price: string;
  amount: string;
  deadline: string;
  startAt: string;
  endAt: string;
  recipient: string;
  claimKind: V3ClaimKind;
};

function datetimeLocal(secondsFromNow: number) {
  const date = new Date(Date.now() + secondsFromNow * 1_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function createV3MarketFormState(recipient = ""): V3MarketFormState {
  return {
    action: "fixed-buy",
    tokenId: "",
    offerId: "",
    price: "",
    amount: "",
    deadline: datetimeLocal(86_400),
    startAt: datetimeLocal(600),
    endAt: datetimeLocal(86_400),
    recipient,
    claimKind: "seller-proceeds",
  };
}

function tokenId(value: string) {
  if (!/^[0-9]+$/.test(value.trim())) throw new Error("Enter a decimal token ID.");
  return BigInt(value.trim());
}

function offerId(value: string) {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error("Enter a 32-byte offer ID.");
  return normalized as `0x${string}`;
}

function amount(value: string, decimals: number, label: string) {
  try {
    const parsed = parseUnits(value.trim(), decimals);
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be a positive ${decimals}-decimal settlement amount.`);
  }
}

function timestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  return BigInt(Math.floor(milliseconds / 1_000));
}

function recipient(value: string) {
  try {
    return getAddress(value.trim());
  } catch {
    throw new Error("Enter a valid recipient address.");
  }
}

export function buildV3MarketIntent(
  state: V3MarketFormState,
  settlementDecimals: number,
): V3MarketActionIntent {
  switch (state.action) {
    case "marketplace-approve":
      return { kind: state.action, tokenId: tokenId(state.tokenId) };
    case "fixed-list":
      return {
        kind: state.action,
        tokenId: tokenId(state.tokenId),
        price: amount(state.price, settlementDecimals, "Price"),
        deadline: timestamp(state.deadline, "listing deadline"),
      };
    case "fixed-update":
      return {
        kind: state.action,
        tokenId: tokenId(state.tokenId),
        newPrice: amount(state.price, settlementDecimals, "New price"),
        newDeadline: timestamp(state.deadline, "listing deadline"),
      };
    case "fixed-cancel":
    case "fixed-invalidate":
      return { kind: state.action, tokenId: tokenId(state.tokenId) };
    case "fixed-buy":
      return { kind: state.action, tokenId: tokenId(state.tokenId), recipient: recipient(state.recipient) };
    case "offer-create":
      return {
        kind: state.action,
        tokenId: tokenId(state.tokenId),
        recipient: recipient(state.recipient),
        amount: amount(state.amount, settlementDecimals, "Offer"),
        deadline: timestamp(state.deadline, "offer deadline"),
      };
    case "offer-cancel":
    case "offer-accept":
    case "offer-invalidate":
      return { kind: state.action, offerId: offerId(state.offerId) };
    case "auction-create":
      return {
        kind: state.action,
        tokenId: tokenId(state.tokenId),
        reservePrice: amount(state.price, settlementDecimals, "Reserve price"),
        startAt: timestamp(state.startAt, "auction start"),
        endAt: timestamp(state.endAt, "auction end"),
      };
    case "auction-bid":
      return {
        kind: state.action,
        tokenId: tokenId(state.tokenId),
        amount: amount(state.amount, settlementDecimals, "Bid"),
        recipient: recipient(state.recipient),
      };
    case "auction-cancel":
    case "auction-finalize":
      return { kind: state.action, tokenId: tokenId(state.tokenId) };
    case "claim":
      return { kind: state.action, claimKind: state.claimKind, recipient: recipient(state.recipient) };
    default: {
      const exhaustive: never = state.action;
      throw new Error(`Unsupported market action: ${String(exhaustive)}`);
    }
  }
}
