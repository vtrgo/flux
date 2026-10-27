import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TimesheetGridRow } from './TimesheetGridRow';
import { GridRow, Machine, MachineAssembly } from '../../types';

describe('TimesheetGridRow Assembly Selection', () => {
  const mockMachines: Machine[] = [
    {
      id: 'mach-1',
      order_number: 'VTR-2001',
      model_type: 'Feeder',
      status: 'assembly',
    },
  ];

  const mockAssemblies: MachineAssembly[] = [
    {
      id: 'asm-101',
      machine_id: 'mach-1',
      assembly_code: 'ASM-01',
      name: 'Infeed Conveyor',
      revision: 'A',
      department: 'assembly',
      quoted_hours: 20,
      actual_hours: 5,
      variance: -15,
      status: 'in_assembly',
      sequence_order: 1,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'asm-102',
      machine_id: 'mach-1',
      assembly_code: 'ASM-02',
      name: 'Discharge Chute',
      revision: 'B',
      department: 'assembly',
      quoted_hours: 10,
      actual_hours: 0,
      variance: -10,
      status: 'ready_for_kitting',
      sequence_order: 2,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
  ];

  const weekDays = [
    { dateStr: '2026-10-18', dayName: 'Sun', shortDate: '10/18', fullName: 'Sunday, Oct 18' },
    { dateStr: '2026-10-19', dayName: 'Mon', shortDate: '10/19', fullName: 'Monday, Oct 19' },
  ];

  it('disables assembly select when machine is none or unselected', () => {
    const row: GridRow = {
      rowKey: 'row-1',
      task_name: 'Shop Maintenance',
      entry_type: 'indirect',
      days: {},
      descriptions: {},
    };

    render(
      <table>
        <tbody>
          <TimesheetGridRow
            row={row}
            machines={mockMachines}
            machineAssemblies={mockAssemblies}
            departmentTasks={[]}
            machineTasks={[]}
            machineReworks={[]}
            machineDefects={[]}
            weekDays={weekDays}
            effectiveDepartment="assembly"
            isLocked={false}
            onMachineChange={vi.fn()}
            onAssemblyChange={vi.fn()}
            onTaskChange={vi.fn()}
            onReworkItemChange={vi.fn()}
            onDefectChange={vi.fn()}
            onTypeChange={vi.fn()}
            onCellChange={vi.fn()}
            onRemoveRow={vi.fn()}
          />
        </tbody>
      </table>
    );

    const assemblySelect = screen.getByLabelText('Assembly / Sub-assembly');
    expect(assemblySelect).toBeDisabled();
    expect(screen.getByText('N/A (Indirect / Shop)')).toBeInTheDocument();
  });

  it('populates machine assemblies and triggers onAssemblyChange when machine is selected', () => {
    const onAssemblyChange = vi.fn();
    const row: GridRow = {
      rowKey: 'row-2',
      machine_id: 'mach-1',
      order_number: 'VTR-2001',
      task_name: 'Mechanical Assembly',
      entry_type: 'production',
      days: {},
      descriptions: {},
    };

    render(
      <table>
        <tbody>
          <TimesheetGridRow
            row={row}
            machines={mockMachines}
            machineAssemblies={mockAssemblies}
            departmentTasks={[]}
            machineTasks={[]}
            machineReworks={[]}
            machineDefects={[]}
            weekDays={weekDays}
            effectiveDepartment="assembly"
            isLocked={false}
            onMachineChange={vi.fn()}
            onAssemblyChange={onAssemblyChange}
            onTaskChange={vi.fn()}
            onReworkItemChange={vi.fn()}
            onDefectChange={vi.fn()}
            onTypeChange={vi.fn()}
            onCellChange={vi.fn()}
            onRemoveRow={vi.fn()}
          />
        </tbody>
      </table>
    );

    const assemblySelect = screen.getByLabelText('Assembly / Sub-assembly');
    expect(assemblySelect).not.toBeDisabled();
    expect(screen.getByText('General Machine Labor (No Assembly)')).toBeInTheDocument();
    expect(screen.getByText('[ASM-01] Infeed Conveyor')).toBeInTheDocument();
    expect(screen.getByText('[ASM-02] Discharge Chute')).toBeInTheDocument();

    fireEvent.change(assemblySelect, { target: { value: 'asm-101' } });
    expect(onAssemblyChange).toHaveBeenCalledWith('row-2', 'asm-101');
  });

  it('renders assembly code and name when row is locked', () => {
    const row: GridRow = {
      rowKey: 'row-3',
      machine_id: 'mach-1',
      order_number: 'VTR-2001',
      assembly_id: 'asm-101',
      assembly_code: 'ASM-01',
      assembly_name: 'Infeed Conveyor',
      task_name: 'Mechanical Assembly',
      entry_type: 'production',
      days: {},
      descriptions: {},
    };

    render(
      <table>
        <tbody>
          <TimesheetGridRow
            row={row}
            machines={mockMachines}
            machineAssemblies={mockAssemblies}
            departmentTasks={[]}
            machineTasks={[]}
            machineReworks={[]}
            machineDefects={[]}
            weekDays={weekDays}
            effectiveDepartment="assembly"
            isLocked={true}
            onMachineChange={vi.fn()}
            onAssemblyChange={vi.fn()}
            onTaskChange={vi.fn()}
            onReworkItemChange={vi.fn()}
            onDefectChange={vi.fn()}
            onTypeChange={vi.fn()}
            onCellChange={vi.fn()}
            onRemoveRow={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('[ASM-01] Infeed Conveyor')).toBeInTheDocument();
  });
});
