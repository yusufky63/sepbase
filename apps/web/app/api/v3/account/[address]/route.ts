import { getAddress, isAddress } from "viem";
import {
  V3_OPTIONS,
  getServerV3Client,
  v3ApiContext,
  v3ApiError,
  v3ApiJson,
  v3Deployed,
  v3DeploymentPending,
} from "@/lib/v3-api";

export { V3_OPTIONS as OPTIONS };

function decimal(value: string | null, fallback: bigint, label: string) {
  const input = value ?? fallback.toString();
  if (!/^(0|[1-9][0-9]{0,77})$/.test(input)) throw new Error(`${label} must be a decimal uint.`);
  return BigInt(input);
}

export function booleanQuery(value: string | null, label: string) {
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${label} must be true or false.`);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
) {
  if (!v3Deployed) return v3DeploymentPending();
  const rawAddress = (await context.params).address;
  if (!isAddress(rawAddress)) return v3ApiError(400, "INVALID_ACCOUNT", "A valid account address is required.");
  const account = getAddress(rawAddress);
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "24");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return v3ApiError(400, "INVALID_LIMIT", "limit must be an integer from 1 to 50.");
  }
  let nameCursor: bigint;
  let offerCursor: bigint;
  let blockNumber: bigint | undefined;
  try {
    nameCursor = decimal(url.searchParams.get("nameCursor"), 0n, "nameCursor");
    offerCursor = decimal(url.searchParams.get("offerCursor"), 0n, "offerCursor");
    blockNumber = url.searchParams.has("blockNumber")
      ? decimal(url.searchParams.get("blockNumber"), 0n, "blockNumber")
      : undefined;
  } catch (error) {
    return v3ApiError(400, "INVALID_CURSOR", error instanceof Error ? error.message : "Invalid cursor.");
  }
  let includeTerminal: boolean;
  try {
    includeTerminal = booleanQuery(url.searchParams.get("includeTerminal"), "includeTerminal");
  } catch (error) {
    return v3ApiError(
      400,
      "INVALID_BOOLEAN",
      error instanceof Error ? error.message : "Invalid boolean query parameter.",
    );
  }
  try {
    const client = await getServerV3Client();
    const names = await client.getOwnedNames(account, nameCursor, limit, blockNumber);
    const at = names.blockNumber;
    const [balances, buyerOffers, ownerOffers] = await Promise.all([
      client.getAccountBalances(account, at),
      client.getBuyerOffers(account, offerCursor, limit, includeTerminal, at),
      client.getOwnerOffers(account, offerCursor, limit, includeTerminal, at),
    ]);
    return v3ApiJson({
      data: { account, names, balances, buyerOffers, ownerOffers, blockNumber: at },
      context: v3ApiContext(),
    });
  } catch {
    return v3ApiError(503, "RPC_UNAVAILABLE", "The configured V3 account snapshot failed.");
  }
}
