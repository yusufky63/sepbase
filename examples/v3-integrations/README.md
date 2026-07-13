# SEPBASE V3 compiled integration fixture

This private workspace package type-checks the V3 SDK, Viem, Wagmi, React and
MCP examples against the exact repository sources. It performs no signing,
broadcasting or payment and makes no network request during CI.

Run from the repository root:

```bash
pnpm examples:v3:typecheck
```

The public `@sepbase/*` packages are not yet published, so this fixture
intentionally does not present an `npm install` command as currently runnable.
