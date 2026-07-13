import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectConfig } from "@/config/project.config";
import { v3Manifest } from "@/lib/v3-api";
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
      "/deployment-manifest.v3.json",
    );
    expect(screen.getByRole("link", { name: "llms.txt" })).toHaveAttribute("href", "/llms.txt");
    expect(screen.getByText(v3Manifest.settlement.symbol)).toBeInTheDocument();
    expect(screen.queryByText(String(projectConfig.chain.id))).not.toBeInTheDocument();
    expect(screen.queryByText(/PROTOCOL/)).not.toBeInTheDocument();
  });
});
