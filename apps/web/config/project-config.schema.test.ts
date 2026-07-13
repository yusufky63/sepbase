import { describe, expect, it } from "vitest";
import { projectConfig } from "./project.config";
import { projectConfigSchema } from "./project-config.schema";

describe("projectConfigSchema integration routes", () => {
  it("accepts only same-origin non-traversing route paths", () => {
    expect(() => projectConfigSchema.parse({
      ...projectConfig,
      integration: { ...projectConfig.integration, docsPath: "//internal.example/docs" },
    })).toThrow(/same-origin/i);

    expect(() => projectConfigSchema.parse({
      ...projectConfig,
      integration: { ...projectConfig.integration, openApiPath: "/%252e%252e/private" },
    })).toThrow();
  });
});
