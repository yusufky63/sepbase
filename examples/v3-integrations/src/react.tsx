"use client";

import { SepbaseV3Identity, SepbaseV3Provider } from "@sepbase/react";

export function V3VerifiedIdentity({
  manifestUrl,
  address,
}: {
  manifestUrl: string;
  address: string;
}) {
  return (
    <SepbaseV3Provider
      manifestUrl={manifestUrl}
      allowedManifestOrigins={[new URL(manifestUrl).origin]}
    >
      <SepbaseV3Identity address={address} profileBaseUrl="/name" />
    </SepbaseV3Provider>
  );
}
