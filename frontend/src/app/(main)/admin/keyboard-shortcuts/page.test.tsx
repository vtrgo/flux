import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import KeyboardShortcutsManual from "./page";

describe("KeyboardShortcutsManual Page", () => {
  it("renders page title and back link to admin", () => {
    render(<KeyboardShortcutsManual />);

    expect(screen.getByText("Keyboard Shortcuts Manual")).toBeInTheDocument();
    expect(screen.getByText(/Back to Admin/i)).toBeInTheDocument();
  });

  it("renders all documented shortcut scopes and commands", () => {
    render(<KeyboardShortcutsManual />);

    expect(screen.getByText("Global Navigation & Actions")).toBeInTheDocument();
    expect(screen.getByText("Modals & Popups")).toBeInTheDocument();
    expect(screen.getByText("Weekly Timesheet Grid")).toBeInTheDocument();

    // Verify key badges
    expect(screen.getByText("Esc")).toBeInTheDocument();
    expect(screen.getAllByText("Cmd/Ctrl").length).toBeGreaterThanOrEqual(1);
  });
});
