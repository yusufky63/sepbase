import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExampleTabs } from "./code-block";

const examples = [
  { id: "sdk", label: "SDK", language: "TypeScript", code: "const sdk = true;" },
  { id: "shell", label: "Shell", language: "Shell", code: "echo ready" },
] as const;

describe("ExampleTabs keyboard model", () => {
  it("uses roving tab focus with arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    render(<ExampleTabs examples={examples} />);
    const sdk = screen.getByRole("tab", { name: "SDK" });
    const shell = screen.getByRole("tab", { name: "Shell" });

    sdk.focus();
    await user.keyboard("{ArrowRight}");
    expect(shell).toHaveFocus();
    expect(shell).toHaveAttribute("aria-selected", "true");
    expect(sdk).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{Home}");
    expect(sdk).toHaveFocus();
    await user.keyboard("{End}");
    expect(shell).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "example-tab-shell",
    );
  });
});
