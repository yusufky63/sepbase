export type V3PageDirection = "next" | "previous";

export function v3MarketPageTarget(input: {
  direction: V3PageDirection;
  cursor: bigint;
  nextCursor: bigint;
  history: readonly bigint[];
}) {
  if (input.direction === "previous") return input.history.at(-1) ?? null;
  return input.nextCursor > input.cursor ? input.nextCursor : null;
}

export function v3MarketPageHistory(input: {
  direction: V3PageDirection;
  cursor: bigint;
  history: readonly bigint[];
}) {
  return input.direction === "next"
    ? [...input.history, input.cursor]
    : input.history.slice(0, -1);
}

export function assertV3MarketPageBlock(pageBlockNumber: bigint, pinnedBlockNumber: bigint) {
  if (pageBlockNumber !== pinnedBlockNumber) throw new Error("V3_MARKET_BLOCK_MISMATCH");
}
