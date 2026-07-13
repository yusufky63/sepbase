import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isMainModule } from "./lib/is-main";

type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies";

type PackageManifest = {
  name?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
};

const dependencySections: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];

const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isExactSpecifier(specifier: string) {
  if (specifier === "workspace:*") return true;
  if (exactVersion.test(specifier)) return true;

  if (specifier.startsWith("npm:")) {
    const versionSeparator = specifier.lastIndexOf("@");
    return versionSeparator > "npm:".length
      && exactVersion.test(specifier.slice(versionSeparator + 1));
  }

  return false;
}

async function packageManifestPaths(root: string) {
  const paths = [resolve(root, "package.json")];
  for (const workspaceDirectory of ["apps", "packages", "examples"] as const) {
    const directory = resolve(root, workspaceDirectory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = resolve(directory, entry.name, "package.json");
      try {
        await access(manifestPath);
        paths.push(manifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  return paths.sort();
}

export async function validateDependencyPins(root = process.cwd()) {
  const issues: string[] = [];
  const manifests = await packageManifestPaths(resolve(root));

  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
    const packageName = typeof manifest.name === "string" ? manifest.name : manifestPath;

    for (const sectionName of dependencySections) {
      const section = manifest[sectionName];
      if (section === undefined) continue;
      if (typeof section !== "object" || section === null || Array.isArray(section)) {
        issues.push(`${packageName} has a non-object ${sectionName} field.`);
        continue;
      }

      for (const [dependencyName, specifier] of Object.entries(section)) {
        if (typeof specifier !== "string" || !isExactSpecifier(specifier)) {
          issues.push(
            `${packageName} ${sectionName}.${dependencyName} must use an exact version or workspace:*; received ${JSON.stringify(specifier)}.`,
          );
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`Dependency pin validation failed:\n- ${issues.join("\n- ")}`);
  }

  return manifests.length;
}

if (isMainModule(import.meta.url)) {
  const manifestCount = await validateDependencyPins();
  console.log(`Validated exact dependency pins across ${manifestCount} workspace package manifests.`);
}
