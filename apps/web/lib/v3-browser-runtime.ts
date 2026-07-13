"use client";

import {
  createSepbaseV3Client,
  ManifestMismatchError,
  NotDeployedError,
  parseV3SuiteManifest,
  type SepbaseV3Client,
  type V3SuiteManifest,
} from "@sepbase/sdk";
import manifestJson from "../public/deployment-manifest.v3.json";

export const v3BrowserManifest = parseV3SuiteManifest(manifestJson);

export function isV3ManifestOperational(manifest: V3SuiteManifest = v3BrowserManifest) {
  return (manifest.releaseStatus === "candidate" || manifest.releaseStatus === "live")
    && Object.values(manifest.contracts).every((module) => module.address && module.runtimeCodeHash)
    && manifest.wiring.suiteConfigured;
}

export function v3BrowserClientOptions(origin: string, manifest: V3SuiteManifest = v3BrowserManifest) {
  const siteOrigin = new URL(origin).origin;
  const rpcOrigin = new URL(manifest.rpcUrl).origin;
  return {
    manifestUrl: new URL("/deployment-manifest.v3.json", siteOrigin).href,
    rpcUrl: manifest.rpcUrl,
    allowedManifestOrigins: [siteOrigin],
    allowedRpcOrigins: [rpcOrigin],
  } as const;
}

let pendingClient: Promise<SepbaseV3Client> | undefined;

export function getV3BrowserClient() {
  if (!isV3ManifestOperational()) return Promise.reject(new NotDeployedError());
  if (typeof window === "undefined") return Promise.reject(new Error("V3_BROWSER_ONLY"));
  if (!pendingClient) {
    pendingClient = createSepbaseV3Client(v3BrowserClientOptions(window.location.origin))
      .then((client) => {
        if (client.manifest.suiteReleaseId !== v3BrowserManifest.suiteReleaseId) {
          throw new ManifestMismatchError("Browser V3 client loaded another suite release.");
        }
        return client;
      })
      .catch((error: unknown) => {
        pendingClient = undefined;
        throw error;
      });
  }
  return pendingClient;
}
