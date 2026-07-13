import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { generateManifest } from "./generate-manifest";

if (!process.argv.includes("--confirm")) {
  throw new Error("Clone reset is destructive. Re-run with --confirm after reviewing the target.");
}

const workspaceRoot = resolve(process.cwd());
const realWorkspaceRoot = await realpath(workspaceRoot);

function isWithinWorkspace(path: string, allowRoot = false) {
  const pathFromRoot = relative(realWorkspaceRoot, path);
  return (allowRoot || pathFromRoot !== "")
    && pathFromRoot !== ".."
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot);
}

async function nearestExistingRealPath(path: string) {
  let candidate = path;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

async function assertWorkspaceTarget(target: string) {
  const absoluteTarget = resolve(target);
  const lexicalPathFromRoot = relative(workspaceRoot, absoluteTarget);
  if (
    lexicalPathFromRoot === ""
    || lexicalPathFromRoot === ".."
    || lexicalPathFromRoot.startsWith(`..${sep}`)
    || isAbsolute(lexicalPathFromRoot)
  ) {
    throw new Error(`Refusing to remove a path outside the workspace: ${absoluteTarget}`);
  }

  try {
    await lstat(absoluteTarget);
    const resolvedTarget = await realpath(absoluteTarget);
    if (!isWithinWorkspace(resolvedTarget)) {
      throw new Error(`Refusing to remove a path that resolves outside the workspace: ${absoluteTarget}`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    const resolvedAncestor = await nearestExistingRealPath(dirname(absoluteTarget));
    if (!isWithinWorkspace(resolvedAncestor, true)) {
      throw new Error(`Refusing to remove a path whose parent resolves outside the workspace: ${absoluteTarget}`);
    }
  }

  return absoluteTarget;
}

async function removeWorkspaceTarget(target: string) {
  const safeTarget = await assertWorkspaceTarget(target);
  await rm(safeTarget, { recursive: true, force: true });
  return safeTarget;
}

const deploymentDirectory = await assertWorkspaceTarget(resolve(workspaceRoot, "deployments"));
const deploymentEntries = await readdir(deploymentDirectory, { withFileTypes: true });
const removedTargets: string[] = [];
for (const entry of deploymentEntries) {
  if (entry.name === ".gitkeep") continue;
  removedTargets.push(await removeWorkspaceTarget(resolve(deploymentDirectory, entry.name)));
}

for (const target of [
  resolve(workspaceRoot, "contracts", "broadcast"),
  resolve(workspaceRoot, "contracts", "cache"),
  resolve(workspaceRoot, "apps", "web", "public", "abi", "ChainNameService.json"),
]) {
  removedTargets.push(await removeWorkspaceTarget(target));
}

await generateManifest();
console.log(`Cleared ${removedTargets.length} clone-specific deployment artifacts inside ${workspaceRoot}.`);
