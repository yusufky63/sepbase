import "./lib/load-env";
import { projectConfig } from "../apps/web/config/project.config";
import { projectConfigSchema } from "../apps/web/config/project-config.schema";
import { isMainModule } from "./lib/is-main";

export function validateProject(): void {
  const parsed = projectConfigSchema.parse(projectConfig);
  if (parsed.settlement.kind === "native" && parsed.settlement.tokenAddress !== null) {
    throw new Error("Native settlement cannot define a token address.");
  }
  if (parsed.chain.testnet && parsed.pricing.referenceFiat !== null) {
    throw new Error("Testnet profiles cannot publish a fiat price reference.");
  }
  if (parsed.brand.suffix === "base" || parsed.brand.name.toLowerCase() === "basenames") {
    throw new Error("The independent project must not impersonate the official Base naming service.");
  }
}

if (isMainModule(import.meta.url)) {
  validateProject();
  console.log(
    `Validated ${projectConfig.brand.name}: .${projectConfig.brand.suffix} on ${projectConfig.chain.name}`,
  );
}
