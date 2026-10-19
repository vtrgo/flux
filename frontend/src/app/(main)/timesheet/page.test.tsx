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
      {
        id: 'task-2',
        machine_id: 'm-1',
        order_number: 'M-1001',
        task_code: 'panel_wiring',
        task_name: 'Panel Wiring',
        department: 'controls',
        quoted_hours: 20.0,
        actual_hours: 2.0,
        variance: -18.0,
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

    (fetchApi as any).mockImplementation((endpoint: string, options?: any) => {
      if (options?.method === 'PUT' && endpoint.startsWith('department-tasks/')) {
        const body = JSON.parse(options.body);
        return Promise.resolve({
          id: 'dt-1',
          department: 'assembly',
          task_code: 'mech_assembly',
          task_name: 'Mechanical Assembly',
          default_quoted_hours: body.default_quoted_hours ?? 40.0,
          is_active: true,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z',
        });
      }
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
      if (endpoint.startsWith('department-tasks')) {
        return Promise.resolve([
          {
            id: 'dt-1',
            department: 'assembly',
            task_code: 'mech_assembly',
            task_name: 'Mechanical Assembly',
            default_quoted_hours: 40.0,
            is_active: true,
            created_at: '2026-10-19T00:00:00Z',
            updated_at: '2026-10-19T00:00:00Z',
          },
          {
            id: 'dt-2',
            department: 'controls',
            task_code: 'plc_programming',
            task_name: 'PLC Programming',
            default_quoted_hours: 25.0,
            is_active: true,
            created_at: '2026-10-19T00:00:00Z',
            updated_at: '2026-10-19T00:00:00Z',
          },
        ]);
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

    // Verify Total Quoted Hours KPI card is removed
    expect(screen.queryByText('Total Quoted Hours')).not.toBeInTheDocument();
  });

  it('toggles to Department Tasks tab and displays core tasks library with default quote editing', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const deptTabBtn = screen.getByText('🏢 Department Tasks');
    await act(async () => {
      fireEvent.click(deptTabBtn);
    });

    expect(screen.getByText('Core Department Tasks Library')).toBeInTheDocument();
    expect(screen.getByText('mech_assembly')).toBeInTheDocument();
    expect(screen.getByText('Retire Task')).toBeInTheDocument();

    // Verify Edit Default Quote button
    const editDefaultBtn = screen.getByText('Edit Default Quote');
    expect(editDefaultBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(editDefaultBtn);
    });

    // Check save and input
    const saveBtn = screen.getByText('Save');
    expect(saveBtn).toBeInTheDocument();

    const input = screen.getByDisplayValue('40');
    await act(async () => {
      fireEvent.change(input, { target: { value: '45.5' } });
      fireEvent.click(saveBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith(
      'department-tasks/dt-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ default_quoted_hours: 45.5 }),
      })
    );
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

  it('supports project-level department scope and distills task options', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const varianceTabBtn = screen.getByText('📊 Quoting & Variance');
    await act(async () => {
      fireEvent.click(varianceTabBtn);
    });

    // Project Context Bar has Department Scope
    const projectDeptSelect = screen.getByLabelText(/Department Scope:/i);
    expect(projectDeptSelect).toHaveValue('all');

    // Open task assignment panel
    const assignBtn = screen.getByText('+ Define Quoted Task');
    await act(async () => {
      fireEvent.click(assignBtn);
    });

    // In 'all' scope, target department dropdown allows selecting target department
    expect(screen.getByText(/Target Department \*/i)).toBeInTheDocument();
    const deptSelect = screen.getByLabelText(/Target Department \*/i);
    expect(deptSelect).toHaveValue('assembly');

    // Verify task options are distilled to assembly
    expect(screen.getByText(/Distilled Assembly Tasks \*/i)).toBeInTheDocument();
    expect(screen.getByText('Mechanical Assembly (Default: 40h)')).toBeInTheDocument();
    expect(screen.queryByText('PLC Programming (Default: 25h)')).not.toBeInTheDocument();

    // Change department to controls in form
    await act(async () => {
      fireEvent.change(deptSelect, { target: { value: 'controls' } });
    });

    // Verify task options are distilled to controls
    expect(screen.getByText(/Distilled Electrical \/ Controls Tasks \*/i)).toBeInTheDocument();
    expect(screen.getByText('PLC Programming (Default: 25h)')).toBeInTheDocument();
    expect(screen.queryByText('Mechanical Assembly (Default: 40h)')).not.toBeInTheDocument();
  });

  it('filters machine variance tasks by department via project-level scope', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const varianceTabBtn = screen.getByText('📊 Quoting & Variance');
    await act(async () => {
      fireEvent.click(varianceTabBtn);
    });

    // Both assembly and controls tasks exist initially under 'all'
    expect(screen.getByText('Mechanical Assembly')).toBeInTheDocument();
    expect(screen.getByText('Panel Wiring')).toBeInTheDocument();

    // Filter by Controls department via Project Context Bar
    const projectDeptSelect = screen.getByLabelText(/Department Scope:/i);
    await act(async () => {
      fireEvent.change(projectDeptSelect, { target: { value: 'controls' } });
    });

    expect(screen.getByText('Panel Wiring')).toBeInTheDocument();
    expect(screen.queryByText('Mechanical Assembly')).not.toBeInTheDocument();

    // Filter by Laser (empty)
    await act(async () => {
      fireEvent.change(projectDeptSelect, { target: { value: 'laser' } });
    });

    expect(screen.getByText(/No tasks quoted for Laser\./i)).toBeInTheDocument();
    expect(screen.queryByText('Panel Wiring')).not.toBeInTheDocument();

    // Reset via Show All Departments button
    const showAllBtn = screen.getAllByText('Show All Departments')[0];
    await act(async () => {
      fireEvent.click(showAllBtn);
    });

    expect(screen.getByText('Mechanical Assembly')).toBeInTheDocument();
    expect(screen.getByText('Panel Wiring')).toBeInTheDocument();
  });
});

