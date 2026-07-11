import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && metaUrl === pathToFileURL(resolve(entry)).href;
}
