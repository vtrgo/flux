import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ReworkModal } from './ReworkModal';
import { fetchApi } from '../lib/api';
import { toast } from 'sonner';

vi.mock('../lib/api');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('../hooks/useUsers', () => ({
  useUsers: () => ({
    users: [
      { id: 'usr-1', username: 'john_designer', role: 'engineer', department: 'design' },
      { id: 'usr-2', username: 'sarah_pm', role: 'pm', department: 'management' },
      { id: 'usr-3', username: 'mike_machinist', role: 'machinist', department: 'machining' },
    ],
    isLoading: false,
    error: null,
  }),
}));

describe('ReworkModal Component', () => {
  const mockSalesOrders = [
    {
      id: 'so-1',
      customer_name: 'Acme Corp',
      project_name: 'Feeder System Alpha',
      internal_project_number: '1024A',
      po_number: 'PO-999',
    },
  ];

  const mockMachines = [
    {
      id: 'm-1',
      sales_order_id: 'so-1',
      order_number: 'VTR-1024',
      model_type: 'Centrifugal',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchApi as any).mockImplementation((url: string) => {
      if (url === 'sales_orders') return Promise.resolve(mockSalesOrders);
      if (url === 'machines') return Promise.resolve(mockMachines);
      return Promise.resolve({});
    });
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReworkModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with default header and fields when creating new rework item', async () => {
    await act(async () => {
      render(<ReworkModal isOpen={true} onClose={vi.fn()} />);
    });

    expect(screen.getByText('REWORK SOP 1-003')).toBeInTheDocument();
    expect(screen.getByText('Log Rework / Service Part')).toBeInTheDocument();
    expect(screen.getByText('1. Design Department Procedure')).toBeInTheDocument();
    expect(screen.getByText('2. Project Management Review')).toBeInTheDocument();
    expect(screen.getByText('3. Manufacturing Department Execution')).toBeInTheDocument();
    expect(screen.getByText('4. Kitting / Outside Processing Procedure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Rework Item' })).toBeInTheDocument();
  });

  it('populates fields when editing an existing rework item', async () => {
    const mockItem: any = {
      id: 'rwk-1',
      sales_order_id: 'so-1',
      machine_id: 'm-1',
      project_number: '1024A',
      part_number: 'VTR-P-001',
      description: 'Modified guide rail',
      revision: 'B',
      material: 'Aluminum 6061',
      qty: 2,
      part_type: 'MOD',
      reason_for_rework: 'Dimension clearance conflict',
      status: 'design_draft',
      pdm_vault_released: true,
      requires_outside_processing: true,
      outside_vendor: 'Apex Anodizing',
    };

    await act(async () => {
      render(
        <ReworkModal
          isOpen={true}
          editingItem={mockItem}
          onClose={vi.fn()}
        />
      );
    });

    expect(
      screen.getByText('Rework Part: VTR-P-001 (Rev B)')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update Rework Item' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Release to Mfg' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to COMPLETE Tab' })
    ).toBeInTheDocument();

    const partNumInput = screen.getByLabelText(/Part Number/i) as HTMLInputElement;
    expect(partNumInput.value).toBe('VTR-P-001');

    const descInput = screen.getByLabelText(/Description/i) as HTMLInputElement;
    expect(descInput.value).toBe('Modified guide rail');

    const vendorInput = screen.getByLabelText(/Outside Vendor/i) as HTMLInputElement;
    expect(vendorInput.value).toBe('Apex Anodizing');
  });

  it('validates required fields before submitting', async () => {
    let container: HTMLElement;
    await act(async () => {
      const rendered = render(<ReworkModal isOpen={true} onClose={vi.fn()} />);
      container = rendered.container;
    });

    const form = container!.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Please fill in all required fields')
    );
    expect(fetchApi).not.toHaveBeenCalledWith(
      'rework/items',
      expect.anything()
    );
  });

  it('submits form payload to API when required fields are filled', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    let container: HTMLElement;

    await act(async () => {
      const rendered = render(
        <ReworkModal
          isOpen={true}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
      container = rendered.container;
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/^Part Number \*/i), {
      target: { value: 'VTR-NEW-01' },
    });
    fireEvent.change(screen.getByLabelText(/^Description \*/i), {
      target: { value: 'Custom spacer plate' },
    });
    fireEvent.change(screen.getByLabelText(/^Material \*/i), {
      target: { value: '304 Stainless Steel' },
    });
    fireEvent.change(screen.getByLabelText(/^Reason for Rework \*/i), {
      target: { value: 'Missing component from original kit' },
    });

    const form = container!.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(fetchApi).toHaveBeenCalledWith(
      'rework/items',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Rework item logged successfully per SOP 1-003'
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handles quick status transition', async () => {
    const mockItem: any = {
      id: 'rwk-1',
      part_number: 'VTR-P-001',
      revision: 'A',
      status: 'design_draft',
    };
    const onSaved = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ReworkModal
          isOpen={true}
          editingItem={mockItem}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    });

    const releaseBtn = screen.getByRole('button', { name: 'Release to Mfg' });
    await act(async () => {
      fireEvent.click(releaseBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith(
      'rework/items/rwk-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'released_to_mfg' }),
      })
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Rework transitioned to released_to_mfg'
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
