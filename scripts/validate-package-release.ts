import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const packagePaths = [
  "packages/sdk/package.json",
  "packages/react/package.json",
  "packages/mcp/package.json",
] as const;

const expectedVersion = process.env.RELEASE_VERSION;
if (!expectedVersion) throw new Error("RELEASE_VERSION is required.");

const semver = /^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;
if (!semver.test(expectedVersion)) throw new Error(`Invalid RELEASE_VERSION: ${expectedVersion}`);

await access(resolve("LICENSE"));

for (const path of packagePaths) {
  const parsed = JSON.parse(await readFile(resolve(path), "utf8")) as {
    name?: string;
    version?: string;
    private?: boolean;
    license?: string;
    repository?: { type?: string; url?: string; directory?: string };
    publishConfig?: { access?: string; provenance?: boolean };
    files?: string[];
  };

  if (!parsed.name?.startsWith("@sepbase/")) throw new Error(`${path}: invalid package name.`);
  if (parsed.version !== expectedVersion) {
    throw new Error(`${path}: version ${parsed.version ?? "missing"} does not match ${expectedVersion}.`);
  }
  if (parsed.private === true) throw new Error(`${path}: public package cannot be private.`);
  if (parsed.license !== "MIT") throw new Error(`${path}: license must be MIT.`);
  if (parsed.repository?.type !== "git" || !parsed.repository.url || !parsed.repository.directory) {
    throw new Error(`${path}: complete repository metadata is required.`);
  }
  if (parsed.publishConfig?.access !== "public" || parsed.publishConfig.provenance !== true) {
    throw new Error(`${path}: public npm provenance publishConfig is required.`);
  }
  if (
    !parsed.files?.includes("dist")
    || !parsed.files.includes("README.md")
    || !parsed.files.includes("CHANGELOG.md")
  ) {
    throw new Error(`${path}: files must include dist, README.md, and CHANGELOG.md.`);
  }
}

console.log(`Validated public package release ${expectedVersion}.`);
