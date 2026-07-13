import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { V3AddressVerification } from "@sepbase/sdk";
import { SepbaseV3Identity } from "./v3-identity";
import { SepbaseV3Provider, type SepbaseV3IdentityClient } from "./v3-provider";

const address = "0x78de409a6306550882328E2a67160471368387FF" as const;

function identity(verified: boolean): V3AddressVerification {
  return {
    address,
    name: verified ? "é.sepbase" : null,
    verified,
    reason: verified ? null : "no-primary",
    blockNumber: 10n,
  };
}

describe("SepbaseV3Identity", () => {
  it("renders canonical Unicode only after same-block forward confirmation", async () => {
    const client: SepbaseV3IdentityClient = {
      verifyAddress: vi.fn().mockResolvedValue(identity(true)),
    };
    render(
      <SepbaseV3Provider client={client}>
        <SepbaseV3Identity address={address} profileBaseUrl="https://sepbase.example/name" />
      </SepbaseV3Provider>,
    );

    expect(await screen.findByText("é.sepbase")).toBeVisible();
    expect(screen.getByText("V3 VERIFIED")).toBeVisible();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://sepbase.example/name/%C3%A9",
    );
  });

  it("falls back to the checksum address when V3 verification is absent", async () => {
    const client: SepbaseV3IdentityClient = {
      verifyAddress: vi.fn().mockResolvedValue(identity(false)),
    };
    render(
      <SepbaseV3Provider client={client}>
        <SepbaseV3Identity address={address} />
      </SepbaseV3Provider>,
    );

    expect(await screen.findByText("0x78de...87FF")).toBeVisible();
    expect(screen.queryByText("V3 VERIFIED")).not.toBeInTheDocument();
  });
});
