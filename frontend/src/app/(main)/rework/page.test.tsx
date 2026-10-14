import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import ReworkHubPage from './page';
import { fetchApi } from '../../../lib/api';

vi.mock('../../../lib/api');
vi.mock('../../../components/SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: () => true,
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ReworkHubPage', () => {
  const mockReworkItems = [
    {
      id: 'rw-1',
      sales_order_id: 'so-1',
      project_name: 'Cap Feeder',
      customer_name: 'P&G',
      machine_id: 'm-1',
      order_number: '1024A',
      project_number: '1024A',
      sub_assembly: 'Sub-Assy 01 - Chute',
      part_number: 'VTR-CH-001',
      description: 'Chute Mounting Bracket',
      revision: 'B',
      material: '6061-T6 Aluminum',
      qty: 2,
      part_type: 'MOD',
      mech_designer_name: 'John Designer',
      reason_for_rework: 'Clearance issue with sensor gate',
      requested_completion_date: '2026-10-25',
      assigned_machinist_name: 'Dave Machinist',
      expected_completion_date: '2026-10-24',
      status: 'in_machining',
      estimated_hours: 4.0,
      actual_hours: 2.5,
      requires_outside_processing: false,
      is_after_hours_drop: false,
      created_at: '2026-10-14T10:00:00Z',
      updated_at: '2026-10-14T10:00:00Z',
    },
    {
      id: 'rw-2',
      sales_order_id: 'so-1',
      project_name: 'Cap Feeder',
      customer_name: 'P&G',
      machine_id: 'm-1',
      order_number: '1024A',
      project_number: '1024A',
      sub_assembly: 'Sub-Assy 02 - Escapement',
      part_number: 'VTR-ESC-005',
      description: 'Pneumatic Stop Pin',
      revision: 'A',
      material: '304 Stainless Steel',
      qty: 1,
      part_type: 'NEW',
      mech_designer_name: 'Sarah Designer',
      reason_for_rework: 'Design change post-FAT testing',
      requested_completion_date: '2026-10-28',
      assigned_machinist_name: 'Dave Machinist',
      expected_completion_date: '2026-10-26',
      status: 'outside_processing',
      requires_outside_processing: true,
      outside_vendor: 'Apex Anodizing',
      estimated_hours: 6.0,
      actual_hours: 5.0,
      is_after_hours_drop: false,
      created_at: '2026-10-14T11:00:00Z',
      updated_at: '2026-10-14T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchApi as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === 'rework/items') {
        return Promise.resolve(mockReworkItems);
      }
      if (url === 'sales_orders') {
        return Promise.resolve([
          { id: 'so-1', customer_name: 'P&G', project_name: 'Cap Feeder', po_number: 'PO-881' },
        ]);
      }
      if (url === 'machines') {
        return Promise.resolve([
          { id: 'm-1', order_number: '1024A', model_type: 'Centrifugal Feeder', sales_order_id: 'so-1' },
        ]);
      }
      if (url === 'users') {
        return Promise.resolve([
          { id: 'u-1', username: 'johndoe', role: 'designer' },
        ]);
      }
      if (url === 'rework/controls') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
  });

  it('renders rework hub title and metrics correctly', async () => {
    await act(async () => {
      render(<ReworkHubPage />);
    });

    expect(screen.getByText('Rework Operations Hub')).toBeDefined();
    expect(screen.getByText('SOP 1-003 Standard Operating Procedure for Rework & Part Tracking')).toBeDefined();
    expect(screen.getByText('VTR-CH-001')).toBeDefined();
    expect(screen.getByText('VTR-ESC-005')).toBeDefined();
    expect(screen.getByText('Chute Mounting Bracket')).toBeDefined();
  });

  it('filters rework items by search query', async () => {
    await act(async () => {
      render(<ReworkHubPage />);
    });

    const searchInput = screen.getByPlaceholderText('Search part #, description, project...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Chute' } });
    });

    expect(screen.getByText('VTR-CH-001')).toBeDefined();
    expect(screen.queryByText('VTR-ESC-005')).toBeNull();
  });

  it('filters rework items by part type NEW vs MOD', async () => {
    await act(async () => {
      render(<ReworkHubPage />);
    });

    const modButton = screen.getByRole('radio', { name: 'MOD' });
    await act(async () => {
      fireEvent.click(modButton);
    });

    expect(screen.getByText('VTR-CH-001')).toBeDefined();
    expect(screen.queryByText('VTR-ESC-005')).toBeNull();
  });

  it('opens rework modal when clicking Log Rework Item button', async () => {
    await act(async () => {
      render(<ReworkHubPage />);
    });

    const logButton = screen.getByText('+ Log Rework Item');
    await act(async () => {
      fireEvent.click(logButton);
    });

    expect(screen.getByText('Log Rework / Service Part')).toBeDefined();
    expect(screen.getByText('1. Design Department Procedure')).toBeDefined();
    expect(screen.getByText('2. Project Management Review')).toBeDefined();
  });
});
