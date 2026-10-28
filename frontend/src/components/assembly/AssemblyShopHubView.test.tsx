import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AssemblyShopHubView } from './AssemblyShopHubView';
import { fetchApi } from '../../lib/api';

vi.mock('../../lib/api');
vi.mock('../../hooks/useMachineFATReadiness', () => ({
  useMachineFATReadiness: (machineId?: string) => ({
    readiness: machineId
      ? {
          machine_id: machineId,
          can_proceed: false,
          open_issues: 0,
          open_ncrs: 0,
          active_rework: 0,
          uncompleted_assemblies: 1,
          blockers: ['1 assembly unit(s) pending completion or QC verification'],
        }
      : null,
    loading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AssemblyShopHubView Component', () => {
  const mockMachines = [
    {
      id: 'm-2',
      order_number: 'VTR-8002',
      model_type: 'Cartoner Pro',
      status: 'assembly',
      lead: 'Dave Assembler',
    },
  ];

  const mockAssemblies = [
    {
      id: 'asm-201',
      machine_id: 'm-2',
      assembly_code: 'ASM-01',
      name: 'Main Drive Singulator',
      description: 'Primary feed singulation unit',
      drawing_number: 'DWG-2001',
      revision: 'C',
      quoted_hours: 16,
      actual_hours: 8,
      status: 'in_assembly',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders assembly shop table, FAT alert, and updates assembly status', async () => {
    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url === 'machines') return mockMachines;
      if (url === 'machines/m-2/assemblies') return mockAssemblies;
      if (url === 'assemblies/asm-201') {
        return {
          id: 'asm-201',
          status: 'assembled',
        };
      }
      return null;
    });

    await act(async () => {
      render(<AssemblyShopHubView initialMachineId="m-2" />);
    });

    // Check header and machine info
    expect(screen.getByText('LEAD:')).toBeInTheDocument();
    expect(screen.getByText('Dave Assembler')).toBeInTheDocument();

    // Check FAT Readiness blocker
    expect(screen.getByTestId('fat-blocked-banner')).toBeInTheDocument();
    expect(screen.getByText(/1 assembly unit\(s\) pending completion or QC verification/i)).toBeInTheDocument();

    // Check assembly row
    expect(screen.getByText('ASM-01')).toBeInTheDocument();
    expect(screen.getByText('Main Drive Singulator')).toBeInTheDocument();
    expect(screen.getByText('DWG-2001 (Rev C)')).toBeInTheDocument();

    // Change status to assembled
    const select = screen.getByLabelText('Status for ASM-01');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'assembled' } });
    });

    expect(fetchApi).toHaveBeenCalledWith('assemblies/asm-201', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ status: 'assembled' }),
    }));
  });
});
