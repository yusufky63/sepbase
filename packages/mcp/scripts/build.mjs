import { build } from "esbuild";

const shared = {
  alias: {
    "@sepbase/sdk": "../sdk/src/index.ts",
  },
  bundle: true,
  external: [
    "@modelcontextprotocol/sdk/*",
    "viem",
    "zod",
    "zod/*",
  ],
  format: "esm",
  logLevel: "info",
  platform: "node",
  sourcemap: true,
  target: "node22",
};

await build({
  ...shared,
  entryPoints: ["src/index.ts", "src/http.ts", "src/v3-http.ts"],
  outdir: "dist",
});

await build({
  ...shared,
  entryPoints: ["src/stdio.ts"],
  outfile: "dist/stdio.js",
});
