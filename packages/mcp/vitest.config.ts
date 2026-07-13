import { fileURLToPath } from "node:url";

export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@sepbase/sdk": fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url)),
      viem: fileURLToPath(new URL("../sdk/node_modules/viem", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
};
