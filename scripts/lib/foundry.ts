import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export function resolveForgeExecutable(): string {
  const configured = process.env.FORGE_BIN?.trim();
  if (configured) return configured;

  const binary = process.platform === "win32" ? "forge.exe" : "forge";
  const userInstall = resolve(homedir(), ".foundry", "bin", binary);
  return existsSync(userInstall) ? userInstall : binary;
}
