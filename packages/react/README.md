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

CSS custom properties:

- `--sepbase-identity-background`
- `--sepbase-identity-border`
- `--sepbase-identity-foreground`
- `--sepbase-identity-muted`
- `--sepbase-identity-accent`
- `--sepbase-identity-accent-contrast`
- `--sepbase-identity-font`
- `--sepbase-identity-name-font`
