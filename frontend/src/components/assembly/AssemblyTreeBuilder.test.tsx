import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { AssemblyTreeBuilder } from "./AssemblyTreeBuilder";
import { fetchApi } from "../../lib/api";

vi.mock("../../lib/api");
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AssemblyTreeBuilder Component", () => {
  const mockAssemblies = [
    {
      id: "asm-1",
      machine_id: "m-1",
      assembly_code: "ASM-01",
      name: "Bowl Drive Unit",
      drawing_number: "VTR-1024-D01",
      revision: "B",
      department: "assembly",
      quoted_hours: 16.0,
      actual_hours: 14.5,
      variance: -1.5,
      status: "assembled",
      sequence_order: 1,
      parts: [
        {
          id: "p-1",
          part_number: "MTR-100",
          qty_required: 1,
          qty_picked: 1,
          status: "fulfilled",
        },
      ],
      sub_assemblies: [
        {
          id: "sub-1",
          machine_id: "m-1",
          parent_assembly_id: "asm-1",
          assembly_code: "SUB-01A",
          name: "Motor Mount Plate",
          drawing_number: "VTR-1024-D01-1",
          revision: "A",
          department: "assembly",
          quoted_hours: 4.0,
          actual_hours: 3.5,
          variance: -0.5,
          status: "assembled",
          sequence_order: 1,
          parts: [],
          sub_assemblies: [],
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no assemblies exist", async () => {
    (fetchApi as any).mockResolvedValueOnce([]);

    await act(async () => {
      render(<AssemblyTreeBuilder machineId="m-1" />);
    });

    expect(screen.getByText(/Assemblies & Sub-Units/i)).toBeInTheDocument();
    expect(screen.getByText(/No assemblies defined for this machine yet/i)).toBeInTheDocument();
  });

  it("renders nested assembly tree with sub-assemblies and hours", async () => {
    (fetchApi as any).mockResolvedValueOnce(mockAssemblies);

    await act(async () => {
      render(<AssemblyTreeBuilder machineId="m-1" orderNumber="VTR-1024" />);
    });

    expect(screen.getByText("ASM-01")).toBeInTheDocument();
    expect(screen.getByText("Bowl Drive Unit")).toBeInTheDocument();
    expect(screen.getByText("SUB-01A")).toBeInTheDocument();
    expect(screen.getByText("Motor Mount Plate")).toBeInTheDocument();
    expect(screen.getByText("MTR-100 (1/1)")).toBeInTheDocument();
  });

  it("opens inline creation form when clicking + Master Assembly", async () => {
    (fetchApi as any).mockResolvedValueOnce([]);

    await act(async () => {
      render(<AssemblyTreeBuilder machineId="m-1" />);
    });

    const addBtn = screen.getByRole("button", { name: "+ Master Assembly" });
    fireEvent.click(addBtn);

    expect(screen.getByLabelText(/Assembly Code \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Assembly Name \*/i)).toBeInTheDocument();
  });

  it("submits new assembly to API", async () => {
    (fetchApi as any).mockResolvedValueOnce([]);

    await act(async () => {
      render(<AssemblyTreeBuilder machineId="m-1" />);
    });

    fireEvent.click(screen.getByRole("button", { name: "+ Master Assembly" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. ASM-01"), {
      target: { value: "ASM-02" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Bowl Drive Unit"), {
      target: { value: "Escapement Unit" },
    });

    (fetchApi as any).mockResolvedValueOnce({ id: "asm-2", assembly_code: "ASM-02" });
    (fetchApi as any).mockResolvedValueOnce([]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(fetchApi).toHaveBeenCalledWith(
      "machines/m-1/assemblies",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("ASM-02"),
      })
    );
  });
});
