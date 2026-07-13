"use client";

import { useSyncExternalStore } from "react";

export type V3MarketExecutionLease = symbol;

let activeLease: V3MarketExecutionLease | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function acquireV3MarketExecutionLease(): V3MarketExecutionLease | null {
  if (activeLease) return null;
  activeLease = Symbol("v3-market-execution");
  emit();
  return activeLease;
}

export function releaseV3MarketExecutionLease(lease: V3MarketExecutionLease) {
  if (activeLease !== lease) return;
  activeLease = null;
  emit();
}

export function isV3MarketExecutionLocked() {
  return activeLease !== null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useV3MarketExecutionLocked() {
  return useSyncExternalStore(subscribe, isV3MarketExecutionLocked, () => false);
}
