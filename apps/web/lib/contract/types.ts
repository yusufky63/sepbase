import type { Address } from "viem";

export const NAME_STATUS = {
  UNREGISTERED: 0,
  ACTIVE: 1,
  GRACE: 2,
  RELEASED: 3,
} as const;

export type NameStatusValue = (typeof NAME_STATUS)[keyof typeof NAME_STATUS];

export type NameProfile = {
  displayName: string;
  bio: string;
  avatar: string;
  website: string;
  twitter: string;
  github: string;
};

export type NameListing = {
  tokenId: bigint;
  seller: Address;
  price: bigint;
  listedAt: bigint;
  feeBps: number;
};

export type NameRecord = {
  label: string;
  tokenId: bigint;
  status: NameStatusValue;
  available: boolean;
  reserved: boolean;
  owner: Address | null;
  resolvedAddress: Address | null;
  expiresAt: bigint | null;
  profile: NameProfile;
  listing: NameListing | null;
  oneYearQuote: bigint;
};

export type RecentRegistration = {
  tokenId: bigint;
  label: string;
  owner: Address;
  registeredAt: bigint;
  expiresAt: bigint;
};

export type OwnedName = {
  tokenId: bigint;
  fullName: string;
  status: NameStatusValue;
  expiresAt: bigint;
  listing: NameListing | null;
};

export type MarketNameListing = NameListing & {
  fullName: string;
  status: NameStatusValue;
  expiresAt: bigint;
};

export const emptyProfile: NameProfile = {
  displayName: "",
  bio: "",
  avatar: "",
  website: "",
  twitter: "",
  github: "",
};
