import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packageDirectories = ["packages/sdk", "packages/react", "packages/mcp"] as const;
const registryArgumentIndex = process.argv.indexOf("--registry");
const registryVersion = registryArgumentIndex === -1
  ? undefined
  : process.argv[registryArgumentIndex + 1];

if (registryArgumentIndex !== -1 && (!registryVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registryVersion))) {
  throw new Error("Registry smoke requires an exact package version, for example: --registry 0.1.0");
}

function run(args: string[], cwd = root, env = process.env) {
  const result = spawnSync(pnpmCommand, args, {
    cwd,
    encoding: "utf8",
    env,
    // Windows requires the .cmd shim so the configured Codex runtime, rather
    // than the system Node executable, launches pnpm.
    shell: process.platform === "win32",
    windowsHide: true,
    stdio: "pipe",
  });
  if (result.status !== 0) {
    const output = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Package smoke command failed: pnpm ${args.join(" ")}\n${output}`);
  }
  return result.stdout.trim();
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "sepbase-package-smoke-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
const consumerDirectory = join(temporaryRoot, "consumer");

try {
  await mkdir(consumerDirectory, { recursive: true });

  if (!registryVersion) {
    await mkdir(tarballDirectory, { recursive: true });
    run(["workspace:build-libs"]);
    for (const directory of packageDirectories) {
      run(["pack", "--pack-destination", tarballDirectory], resolve(root, directory));
    }
  }

  const tarballs = registryVersion
    ? []
    : (await readdir(tarballDirectory))
        .filter((entry) => entry.endsWith(".tgz"))
        .sort();
  if (!registryVersion && tarballs.length !== packageDirectories.length) {
    throw new Error(`Expected ${packageDirectories.length} package tarballs, received ${tarballs.length}.`);
  }

  const tarballFor = (name: string) => {
    const match = tarballs.find((entry) => entry.startsWith(name));
    if (!match) throw new Error(`Missing packed artifact for ${name}.`);
    return `file:../tarballs/${basename(match)}`;
  };
  const sdkSpecifier = registryVersion ?? tarballFor("sepbase-sdk-");
  const reactSpecifier = registryVersion ?? tarballFor("sepbase-react-");
  const mcpSpecifier = registryVersion ?? tarballFor("sepbase-mcp-");

  await writeFile(join(consumerDirectory, "package.json"), `${JSON.stringify({
    name: "sepbase-clean-consumer-smoke",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      typecheck: "tsc --noEmit",
      smoke: "node index.mjs",
    },
    dependencies: {
      "@sepbase/sdk": sdkSpecifier,
      "@sepbase/react": reactSpecifier,
      "@sepbase/mcp": mcpSpecifier,
      react: "19.2.7",
      "react-dom": "19.2.7",
    },
    devDependencies: {
      "@types/react": "19.2.17",
      typescript: "6.0.3",
    },
  }, null, 2)}\n`, "utf8");
  const consumerEnvironment = registryVersion
    ? {
        ...process.env,
        NPM_CONFIG_USERCONFIG: join(consumerDirectory, ".npmrc"),
      }
    : process.env;
  if (registryVersion) {
    await writeFile(
      join(consumerDirectory, ".npmrc"),
      "registry=https://registry.npmjs.org/\nalways-auth=false\n",
      "utf8",
    );
  }
  if (!registryVersion) {
    await writeFile(
      join(consumerDirectory, "pnpm-workspace.yaml"),
      `packages:\n  - .\noverrides:\n  '@sepbase/sdk': '${sdkSpecifier}'\n`,
      "utf8",
    );
  }

  await writeFile(join(consumerDirectory, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      jsx: "react-jsx",
      noEmit: true,
      skipLibCheck: false,
    },
    include: ["index.tsx"],
  }, null, 2)}\n`, "utf8");

  await writeFile(join(consumerDirectory, "index.tsx"), `import {
  createSepbaseV3Client,
  normalizeName,
  type SepbaseV3Client,
} from "@sepbase/sdk";
import { SepbaseV3Identity, SepbaseV3Provider } from "@sepbase/react";
import { createSepbaseV3McpServer } from "@sepbase/mcp";

const normalized = normalizeName("Alice", "sepbase");
const factory: () => Promise<SepbaseV3Client> = async () => createSepbaseV3Client({
  manifestUrl: "https://example.invalid/deployment-manifest.v3.json",
});
void normalized;
void factory;
void SepbaseV3Identity;
void SepbaseV3Provider;
void createSepbaseV3McpServer;
`, "utf8");

  await writeFile(join(consumerDirectory, "index.mjs"), `import {
  createSepbaseV3Client,
  normalizeName,
} from "@sepbase/sdk";
import { SepbaseV3Identity, SepbaseV3Provider } from "@sepbase/react";
import { createSepbaseV3McpServer } from "@sepbase/mcp";

const values = [
  createSepbaseV3Client,
  normalizeName,
  SepbaseV3Identity,
  SepbaseV3Provider,
  createSepbaseV3McpServer,
];
if (values.some((value) => typeof value !== "function")) {
  throw new Error("A public package export is missing from the installed packages.");
}
const normalized = normalizeName("Alice", "sepbase");
if (normalized.normalizedFullName !== "alice.sepbase") {
  throw new Error("The SDK normalization runtime returned an unexpected result.");
}
console.log("SDK, React, and MCP imports are runnable from a clean consumer.");
`, "utf8");

  run(["install", "--ignore-scripts", "--no-frozen-lockfile"], consumerDirectory, consumerEnvironment);
  run(["typecheck"], consumerDirectory, consumerEnvironment);
  const output = run(["smoke"], consumerDirectory, consumerEnvironment);
  if (!output.includes("SDK, React, and MCP imports are runnable")) {
    throw new Error("The clean consumer runtime smoke did not produce its completion marker.");
  }
  const source = registryVersion
    ? `@sepbase package version ${registryVersion} from the npm registry`
    : `${tarballs.length} packed public packages`;
  console.log(`Validated ${source} in an isolated clean consumer.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
