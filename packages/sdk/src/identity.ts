import { type Address, getAddress } from "viem";
import type {
  IdentityVerificationReason,
  NameLifecycle,
  VerifiedAddressIdentity,
  VerifiedNameResolution,
} from "./types.js";

type AddressIdentitySnapshot = {
  account: Address;
  primaryName: string | null;
  label: string | null;
  tokenId: bigint | null;
  status: number;
  owner: Address | null;
  resolvedAddress: Address | null;
  fullName: string | null;
  expiresAt: bigint | null;
  blockNumber: bigint;
};

type NameResolutionSnapshot = {
  label: string;
  fullName: string;
  tokenId: bigint;
  status: number;
  owner: Address | null;
  resolvedAddress: Address | null;
  primaryName: string | null;
  expectedAddress: Address | null;
  expiresAt: bigint | null;
  blockNumber: bigint;
};

export function lifecycleFromStatus(status: number): NameLifecycle {
  if (status === 1) return "active";
  if (status === 2) return "grace";
  if (status === 3) return "released";
  return "unregistered";
}

function sameAddress(left: Address | null, right: Address | null) {
  return left !== null && right !== null && getAddress(left) === getAddress(right);
}

function addressIdentityReason(snapshot: AddressIdentitySnapshot): IdentityVerificationReason {
  if (!snapshot.primaryName) return "no-primary-name";
  if (!snapshot.label || snapshot.tokenId === null) return "invalid-primary-name";
  if (snapshot.status !== 1 && snapshot.status !== 2) return "inactive-name";
  if (snapshot.fullName !== snapshot.primaryName) return "name-mismatch";
  if (!sameAddress(snapshot.owner, snapshot.account)) return "owner-mismatch";
  if (!sameAddress(snapshot.resolvedAddress, snapshot.account)) return "resolution-mismatch";
  return "verified";
}

function nameResolutionReason(snapshot: NameResolutionSnapshot): IdentityVerificationReason {
  if (snapshot.status !== 1 && snapshot.status !== 2) return "inactive-name";
  if (!snapshot.resolvedAddress || snapshot.primaryName !== snapshot.fullName) return "resolution-mismatch";
  if (!sameAddress(snapshot.owner, snapshot.resolvedAddress)) return "owner-mismatch";
  if (snapshot.expectedAddress && !sameAddress(snapshot.resolvedAddress, snapshot.expectedAddress)) {
    return "expected-address-mismatch";
  }
  return "verified";
}

export function assessAddressIdentity(snapshot: AddressIdentitySnapshot): VerifiedAddressIdentity {
  const reason = addressIdentityReason(snapshot);
  return {
    account: getAddress(snapshot.account),
    primaryName: snapshot.primaryName,
    label: snapshot.label,
    tokenId: snapshot.tokenId,
    lifecycle: lifecycleFromStatus(snapshot.status),
    owner: snapshot.owner ? getAddress(snapshot.owner) : null,
    resolvedAddress: snapshot.resolvedAddress ? getAddress(snapshot.resolvedAddress) : null,
    expiresAt: snapshot.expiresAt,
    verified: reason === "verified",
    reason,
    blockNumber: snapshot.blockNumber,
  };
}

export function assessNameResolution(snapshot: NameResolutionSnapshot): VerifiedNameResolution {
  const reason = nameResolutionReason(snapshot);
  return {
    label: snapshot.label,
    fullName: snapshot.fullName,
    tokenId: snapshot.tokenId,
    lifecycle: lifecycleFromStatus(snapshot.status),
    owner: snapshot.owner ? getAddress(snapshot.owner) : null,
    resolvedAddress: snapshot.resolvedAddress ? getAddress(snapshot.resolvedAddress) : null,
    primaryName: snapshot.primaryName,
    expectedAddress: snapshot.expectedAddress ? getAddress(snapshot.expectedAddress) : null,
    expiresAt: snapshot.expiresAt,
    verified: reason === "verified",
    reason,
    blockNumber: snapshot.blockNumber,
  };
}
