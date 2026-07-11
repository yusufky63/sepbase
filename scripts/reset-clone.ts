import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { generateManifest } from "./generate-manifest";

if (!process.argv.includes("--confirm")) {
  throw new Error("Clone reset is destructive. Re-run with --confirm after reviewing the target.");
}

const deploymentDirectory = resolve(process.cwd(), "deployments");
await rm(deploymentDirectory, { recursive: true, force: true });
await generateManifest();
console.log(`Cleared deployment records under ${deploymentDirectory}.`);
