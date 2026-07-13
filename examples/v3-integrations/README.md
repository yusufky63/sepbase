# SEPBASE V3 compiled integration fixture

This private workspace package type-checks the V3 SDK, Viem, Wagmi, React and
MCP examples against the exact repository sources. It performs no signing,
broadcasting or payment and makes no network request during CI.

Run from the repository root:

```bash
pnpm examples:v3:typecheck
```

The exact public packages are available with npm provenance:

```bash
pnpm add @sepbase/sdk@0.1.0 @sepbase/react@0.1.0 @sepbase/mcp@0.1.0
```

This fixture intentionally keeps `workspace:*` dependencies so CI validates
the next source revision before publication. The independent registry smoke is
`pnpm exec tsx scripts/package-release-smoke.ts --registry 0.1.0`.
