import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VerifiedAddressIdentity } from "@sepbase/sdk";
import { SepbaseIdentity } from "./identity";
import { SepbaseProvider, type SepbaseIdentityClient } from "./provider";

const address = "0x78de409a6306550882328E2a67160471368387FF" as const;

function identity(verified: boolean): VerifiedAddressIdentity {
  return {
    account: address,
    primaryName: verified ? "alice.sepbase" : null,
    label: verified ? "alice" : null,
    tokenId: verified ? 1n : null,
    lifecycle: verified ? "active" : "unregistered",
    owner: verified ? address : null,
    resolvedAddress: verified ? address : null,
    expiresAt: verified ? 2_000_000_000n : null,
    verified,
    reason: verified ? "verified" : "no-primary-name",
    blockNumber: 10n,
  };
}

describe("SepbaseIdentity", () => {
  it("shows a name only after forward-confirmed verification", async () => {
    const client: SepbaseIdentityClient = { verifyAddress: vi.fn().mockResolvedValue(identity(true)) };
    render(
      <SepbaseProvider client={client}>
        <SepbaseIdentity address={address} profileBaseUrl="https://sepbase.example/name" />
      </SepbaseProvider>,
    );

    expect(await screen.findByText("alice.sepbase")).toBeVisible();
    expect(screen.getByText("VERIFIED")).toBeVisible();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://sepbase.example/name/alice");
  });

  it("falls back to the address when no verified primary exists", async () => {
    const client: SepbaseIdentityClient = { verifyAddress: vi.fn().mockResolvedValue(identity(false)) };
    render(
      <SepbaseProvider client={client}>
        <SepbaseIdentity address={address} />
      </SepbaseProvider>,
    );

    expect(await screen.findByText("0x78de...87FF")).toBeVisible();
    expect(screen.queryByText("VERIFIED")).not.toBeInTheDocument();
  });
});
