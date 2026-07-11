import "./lib/load-env";
import { spawnSync } from "node:child_process";
import { resolveForgeExecutable } from "./lib/foundry";

const result = spawnSync(resolveForgeExecutable(), process.argv.slice(2), {
  env: process.env,
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
