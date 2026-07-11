import manifestJson from "../public/deployment-manifest.json";
import { deploymentManifestSchema } from "./deployment-manifest.schema";

export const deploymentManifest = deploymentManifestSchema.parse(manifestJson);
export const protocolAddress = deploymentManifest.contract;
export const protocolDeployed = protocolAddress !== null;
