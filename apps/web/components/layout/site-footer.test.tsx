import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectConfig } from "@/config/project.config";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("keeps the public integration resources on their canonical paths", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      projectConfig.integration.docsPath,
    );
    expect(screen.getByRole("link", { name: "Manifest" })).toHaveAttribute(
      "href",
      projectConfig.integration.wellKnownPath,
    );
    expect(screen.getByRole("link", { name: "llms.txt" })).toHaveAttribute("href", "/llms.txt");
  });
});
