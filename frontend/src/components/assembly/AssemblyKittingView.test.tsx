import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AssemblyKittingView } from './AssemblyKittingView';
import { fetchApi } from '../../lib/api';

vi.mock('../../lib/api');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AssemblyKittingView Component', () => {
  const mockMachines = [
    {
      id: 'm-1',
      order_number: 'VTR-5001',
      model_type: 'Centrifugal Feeder',
      status: 'kitting',
    },
  ];

  const mockAssemblies = [
    {
      id: 'asm-1',
      machine_id: 'm-1',
      assembly_code: 'ASM-01',
      name: 'Bowl Drive Assembly',
      drawing_number: 'DWG-1001',
      revision: 'A',
      department: 'assembly',
      status: 'ready_for_kitting',
      parts: [
        {
          id: 'part-1',
          machine_id: 'm-1',
          assembly_id: 'asm-1',
          part_number: 'BOWL-MTR-01',
          description: 'Drive Motor 1/2HP',
          qty_required: 2,
          qty_picked: 1,
          status: 'in_progress',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders assembly tote card with progress and triggers pick update', async () => {
    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url === 'machines') {
        return mockMachines;
      }
      if (url === 'machines/m-1/assemblies') {
        return mockAssemblies;
      }
      if (url === 'kitting/parts/part-1/pick') {
        return {
          id: 'part-1',
          qty_picked: 2,
          status: 'fulfilled',
        };
      }
      return null;
    });

    await act(async () => {
      render(<AssemblyKittingView initialMachineId="m-1" />);
    });

    // Check header and tote card
    expect(screen.getByText('[ASM-01]')).toBeInTheDocument();
    expect(screen.getByText('Bowl Drive Assembly')).toBeInTheDocument();
    expect(screen.getByText('BOWL-MTR-01')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Click "+1" button
    const pickBtn = screen.getByTitle('Pick 1 unit');
    await act(async () => {
      fireEvent.click(pickBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('kitting/parts/part-1/pick', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ qty_picked: 2 }),
    }));
  });

  it('fulfills tote when stage button is clicked', async () => {
    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url === 'machines') return mockMachines;
      if (url === 'machines/m-1/assemblies') return mockAssemblies;
      if (url === 'assemblies/asm-1/fulfill-tote') {
        return {
          id: 'asm-1',
          status: 'kitted',
        };
      }
      return null;
    });

    await act(async () => {
      render(<AssemblyKittingView initialMachineId="m-1" />);
    });

    const stageBtn = screen.getByRole('button', { name: /Pick All & Stage Tote/i });
    expect(stageBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(stageBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('assemblies/asm-1/fulfill-tote', expect.objectContaining({
      method: 'POST',
    }));
  });
});
