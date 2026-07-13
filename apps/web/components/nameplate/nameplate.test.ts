import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectConfig } from "@/config/project.config";
import { Nameplate } from "./nameplate";

describe("Nameplate", () => {
  it("renders the configured modular identity", () => {
    render(createElement(Nameplate, { label: "alice" }));
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText(`.${projectConfig.brand.suffix}`)).toBeInTheDocument();
    expect(screen.getByText(projectConfig.brand.shortName)).toBeInTheDocument();
    expect(screen.getByText(projectConfig.chain.name)).toBeInTheDocument();
  });
});
