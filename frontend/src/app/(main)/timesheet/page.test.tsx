import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import TimesheetPage from './page';
import { fetchApi } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';

vi.mock('../../../lib/api');
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
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

describe('TimesheetPage', () => {
  const mockMachines = [
    {
      id: 'm-1',
      order_number: 'M-1001',
      model_type: 'Centrifugal Feeder',
      status: 'assembly',
      sales_order_id: 'so-1',
      created_at: '2026-10-15T00:00:00Z',
    },
  ];

  const mockTimeEntries = [
    {
      id: 'te-1',
      user_id: 'u-1',
      user_name: 'testuser',
      machine_id: 'm-1',
      order_number: 'M-1001',
      entry_type: 'production' as const,
      project_task_id: 'task-1',
      task_name: 'Mechanical Assembly',
      work_date: new Date().toISOString().split('T')[0],
      hours_spent: 4.5,
      work_description: 'Aligned frame guides and torque checked bolts',
      created_at: '2026-10-19T08:00:00Z',
      updated_at: '2026-10-19T08:00:00Z',
    },
  ];

  const mockLaborSummary = {
    machine_id: 'm-1',
    order_number: 'M-1001',
    model_type: 'Centrifugal Feeder',
    status: 'assembly',
    total_quoted_hours: 40.0,
    total_production_hours: 4.5,
    total_rework_hours: 2.0,
    total_issue_fix_hours: 1.0,
    total_actual_hours: 7.5,
    production_variance: -35.5,
    tasks: [
      {
        id: 'task-1',
        machine_id: 'm-1',
        order_number: 'M-1001',
        task_code: 'mech_assembly',
        task_name: 'Mechanical Assembly',
        department: 'assembly',
        quoted_hours: 40.0,
        actual_hours: 4.5,
        variance: -35.5,
        status: 'open' as const,
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: 'u-1', username: 'testuser', role: 'manager' },
      isAdmin: true,
      hasRole: vi.fn().mockReturnValue(true),
    });

    (fetchApi as any).mockImplementation((endpoint: string) => {
      if (endpoint === 'machines') {
        return Promise.resolve(mockMachines);
      }
      if (endpoint === 'time-entries/my') {
        return Promise.resolve(mockTimeEntries);
      }
      if (endpoint === 'machines/m-1/labor-summary') {
        return Promise.resolve(mockLaborSummary);
      }
      if (endpoint === 'machines/m-1/tasks') {
        return Promise.resolve(mockLaborSummary.tasks);
      }
      return Promise.resolve([]);
    });
  });

  it('renders Timesheet page with header, KPIs, and logged entries', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    expect(screen.getByText('Timesheet & Quoting Hub')).toBeInTheDocument();
    expect(screen.getAllByText('4.50h').length).toBeGreaterThan(0);
    expect(screen.getByText('Aligned frame guides and torque checked bolts')).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
  });

  it('toggles to Quoting & Variance tab and displays task quoting metrics', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const varianceTabBtn = screen.getByText('📊 Quoting & Variance');
    await act(async () => {
      fireEvent.click(varianceTabBtn);
    });

    expect(screen.getByText('Task Allocation & Variance Breakdown: M-1001')).toBeInTheDocument();
    expect(screen.getAllByText('40.0h').length).toBeGreaterThan(0);
    expect(screen.getByText('-35.50h')).toBeInTheDocument();
  });

  it('opens TimesheetLogModal when + LOG TIME is clicked', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const logTimeBtn = screen.getByText('+ LOG TIME');
    await act(async () => {
      fireEvent.click(logTimeBtn);
    });

    expect(screen.getByText('Log Shop Floor Time')).toBeInTheDocument();
    expect(screen.getByText('⚙️ Production Task')).toBeInTheDocument();
    expect(screen.getByText('🔄 Rework (SOP 1-003)')).toBeInTheDocument();
  });
});
