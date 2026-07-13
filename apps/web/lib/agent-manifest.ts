import manifestJson from "../public/agent-integration.json";
import { agentIntegrationManifestSchema } from "./agent-manifest.schema";

export const agentIntegrationManifest = agentIntegrationManifestSchema.parse(manifestJson);
