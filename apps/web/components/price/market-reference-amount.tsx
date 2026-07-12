"use client";

import { useQuery } from "@tanstack/react-query";
import { projectConfig } from "@/config/project.config";
import {
  formatMarketReferenceAmount,
  marketReferenceEnvelopeSchema,
} from "@/lib/market-reference";
import styles from "./price.module.css";

type MarketReferenceAmountProps = {
  amountBaseUnits: bigint;
  assetDecimals: number;
  assetSymbol: string;
  className?: string | undefined;
};

async function loadMarketReference() {
  const response = await fetch("/api/market-reference", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Market reference unavailable.");
  return marketReferenceEnvelopeSchema.parse(await response.json()).data;
}

export function MarketReferenceAmount({
  amountBaseUnits,
  assetDecimals,
  assetSymbol,
  className,
}: MarketReferenceAmountProps) {
  const reference = projectConfig.pricing.marketReference;
  const enabled = Boolean(reference && reference.asset === assetSymbol);
  const quote = useQuery({
    queryKey: ["market-reference", reference?.asset, reference?.currency],
    queryFn: loadMarketReference,
    enabled,
    staleTime: (reference?.cacheSeconds ?? 60) * 1_000,
  });

  if (!enabled || !reference) return null;
  const classNames = `${styles.reference}${className ? ` ${className}` : ""}`;
  if (quote.isPending) return <small className={classNames}>USD REFERENCE / LOADING</small>;
  if (quote.isError) return <small className={classNames}>USD REFERENCE / UNAVAILABLE</small>;

  const formatted = formatMarketReferenceAmount(
    amountBaseUnits,
    assetDecimals,
    quote.data.price,
    quote.data.currency,
  );
  if (!formatted) return null;

  return (
    <small className={classNames}>
      {formatted.startsWith("<") ? formatted : `~ ${formatted}`} REFERENCE
    </small>
  );
}
