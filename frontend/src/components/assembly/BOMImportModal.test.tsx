import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { BOMImportModal } from "./BOMImportModal";
import { fetchApi } from "../../lib/api";
import { toast } from "sonner";

vi.mock("../../lib/api");
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("BOMImportModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BOMImportModal isOpen={false} machineId="m-1" onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders file upload dropzone when open", () => {
    render(
      <BOMImportModal isOpen={true} machineId="m-1" onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    expect(screen.getByText("Design BOM Ingestion")).toBeInTheDocument();
    expect(screen.getByText("Import Assembly Hierarchy CSV")).toBeInTheDocument();
    expect(screen.getByText(/Select or drag SolidWorks PDM BOM CSV/i)).toBeInTheDocument();
  });

  it("previews BOM CSV when file is selected", async () => {
    const mockReport = {
      is_valid: true,
      total_nodes: 2,
      total_parts: 3,
      preview_tree: [
        {
          assembly_code: "ASM-01",
          name: "Bowl Drive Unit",
          quoted_hours: 16.0,
          sub_assemblies: [
            {
              assembly_code: "SUB-01A",
              name: "Motor Mount",
              quoted_hours: 4.0,
            },
          ],
        },
      ],
    };

    (fetchApi as any).mockResolvedValueOnce({
      report: mockReport,
      nodes: [
        { assembly_code: "ASM-01", name: "Bowl Drive Unit", quoted_hours: 16.0 },
        { assembly_code: "SUB-01A", parent_code: "ASM-01", name: "Motor Mount", quoted_hours: 4.0 },
      ],
    });

    render(
      <BOMImportModal isOpen={true} machineId="m-1" onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    const file = new File(
      ["AssemblyCode,Name\nASM-01,Bowl Drive Unit\nSUB-01A,Motor Mount"],
      "test_bom.csv",
      { type: "text/csv" }
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(fetchApi).toHaveBeenCalledWith(
      "machines/m-1/assemblies/import/preview",
      expect.objectContaining({
        method: "POST",
      })
    );

    expect(screen.getByText("✓ BOM Verified")).toBeInTheDocument();
    expect(screen.getByText(/Detected 2 assemblies and 3 component parts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm & Import to Machine" })).toBeEnabled();
  });

  it("commits validated BOM nodes to API when confirmed", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const mockReport = {
      is_valid: true,
      total_nodes: 1,
      total_parts: 0,
      preview_tree: [
        { assembly_code: "ASM-01", name: "Bowl Drive Unit", quoted_hours: 16.0 },
      ],
    };

    (fetchApi as any).mockResolvedValueOnce({
      report: mockReport,
      nodes: [{ assembly_code: "ASM-01", name: "Bowl Drive Unit" }],
    });

    render(
      <BOMImportModal isOpen={true} machineId="m-1" onClose={onClose} onSuccess={onSuccess} />
    );

    const file = new File(["AssemblyCode,Name\nASM-01,Bowl Drive Unit"], "bom.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    (fetchApi as any).mockResolvedValueOnce({ message: "BOM imported successfully" });

    const commitBtn = screen.getByRole("button", { name: "Confirm & Import to Machine" });
    await act(async () => {
      fireEvent.click(commitBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith(
      "machines/m-1/assemblies/import/commit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nodes: [{ assembly_code: "ASM-01", name: "Bowl Drive Unit" }] }),
      })
    );

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Successfully imported 1 assemblies"));
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BOMImportModal isOpen={true} machineId="m-1" onClose={onClose} onSuccess={vi.fn()} />
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
