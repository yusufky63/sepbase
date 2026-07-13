# @sepbase/react

React bindings for manifest-validated, forward-confirmed SEPBASE identity display.

```tsx
import { SepbaseIdentity, SepbaseProvider } from "@sepbase/react";

export function AccountName({ address }: { address: string }) {
  return (
    <SepbaseProvider manifestUrl="https://names.example/.well-known/chain-name-service.json">
      <SepbaseIdentity
        address={address}
        profileBaseUrl="https://names.example/name"
      />
    </SepbaseProvider>
  );
}
```

The component displays a name only when owner, effective lifecycle, primary mapping, and forward resolution agree at one block. Every other state falls back to the checksummed address.

The opt-in V3 bindings use the schema-v4 seven-address manifest and the same
fail-closed identity rule, including canonical Unicode names:

```tsx
import { SepbaseV3Identity, SepbaseV3Provider } from "@sepbase/react";

export function V3AccountName({ address }: { address: string }) {
  return (
    <SepbaseV3Provider manifestUrl="https://names.example/deployment-manifest.v3.json">
      <SepbaseV3Identity address={address} profileBaseUrl="https://names.example/name" />
    </SepbaseV3Provider>
  );
}
```

`SepbaseV3Provider` refuses an address-free `draft` manifest. It becomes usable
only after all seven V3 modules, ABI/runtime hashes, wiring, owner/treasury,
normalization profile, settlement and market policy pass SDK verification.

CSS custom properties:

- `--sepbase-identity-background`
- `--sepbase-identity-border`
- `--sepbase-identity-foreground`
- `--sepbase-identity-muted`
- `--sepbase-identity-accent`
- `--sepbase-identity-accent-contrast`
- `--sepbase-identity-font`
- `--sepbase-identity-name-font`
