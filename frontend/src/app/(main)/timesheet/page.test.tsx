import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
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

  const mockLaborCorrelation = {
    machine_id: 'm-1',
    order_number: 'M-1001',
    model_type: 'Centrifugal Feeder',
    total_assigned_hours: 40.0,
    total_consumed_hours: 7.5,
    net_variance: -32.5,
    overall_burn_percentage: 18.75,
    status: 'on_track' as const,
    unbudgeted_count: 0,
    department_rollups: [
      {
        department: 'assembly',
        assigned_hours: 40.0,
        consumed_hours: 4.5,
        variance: -35.5,
        burn_percentage: 11.25,
        status: 'on_track' as const,
      },
      {
        department: 'controls',
        assigned_hours: 20.0,
        consumed_hours: 2.0,
        variance: -18.0,
        burn_percentage: 10.0,
        status: 'on_track' as const,
      },
    ],
    tasks: [
      {
        correlation_key: 'dt-1',
        project_task_id: 'task-1',
        task_id: 'dt-1',
        task_code: 'mech_assembly',
        task_name: 'Mechanical Assembly',
        department: 'assembly',
        assigned_hours: 40.0,
        consumed_hours: 4.5,
        variance: -35.5,
        burn_percentage: 11.25,
        status: 'on_track' as const,
      },
      {
        correlation_key: 'dt-2',
        project_task_id: 'task-2',
        task_id: 'dt-2',
        task_code: 'panel_wiring',
        task_name: 'Panel Wiring',
        department: 'controls',
        assigned_hours: 20.0,
        consumed_hours: 2.0,
        variance: -18.0,
        burn_percentage: 10.0,
        status: 'on_track' as const,
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
      if (endpoint.startsWith('timesheets/weekly')) {
        if (options?.method === 'PUT') {
          return Promise.resolve(mockWeeklyTimesheet);
        }
        return Promise.resolve(mockWeeklyTimesheet);
      }
      if (endpoint.startsWith('timesheets/approvals')) {
        return Promise.resolve([
          {
            ...mockWeeklyTimesheet,
            status: 'submitted',
            submitted_at: '2026-10-19T10:00:00Z',
          },
        ]);
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
      if (endpoint === 'machines/m-1/labor-correlation') {
        return Promise.resolve(mockLaborCorrelation);
      }
      if (endpoint === 'machines/m-1/tasks') {
        return Promise.resolve(mockLaborSummary.tasks);
      }
      if (endpoint.startsWith('rework/items')) {
        return Promise.resolve([
          {
            id: 'rw-1',
            sales_order_id: 'so-1',
            machine_id: 'm-1',
            part_number: 'RW-PART-100',
            description: 'Shaft realignment',
            status: 'in_machining',
            is_ncr: true,
            ncr_number: 'NCR-2026-001',
            estimated_hours: 8.0,
            actual_hours: 2.0,
          },
        ]);
      }
      if (endpoint === 'machines/m-1/defects') {
        return Promise.resolve([
          {
            id: 'def-1',
            machine_id: 'm-1',
            description: 'Loose sensor bracket',
            severity: 'moderate',
            status: 'open',
            assigned_department: 'assembly',
          },
        ]);
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

  const mockWeeklyTimesheet = {
    id: 'wt-1',
    user_id: 'u-1',
    user_name: 'testuser',
    department: 'assembly',
    week_start_date: '2026-10-19',
    status: 'draft',
    total_hours: 4.5,
    notes: 'Draft note',
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
    entries: mockTimeEntries,
  };

  it('renders Timesheet page with header, weekly grid, and logged tasks', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    expect(screen.getByText('Timesheet & Quoting Hub')).toBeInTheDocument();
    expect(screen.getAllByText(/Mechanical Assembly/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/production/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('4.5h').length).toBeGreaterThan(0);
    expect(screen.getByText('Total Logged This Week:')).toBeInTheDocument();
    expect(screen.getByText('4.50 hrs')).toBeInTheDocument();
  });

  it('displays exact quarter-hour totals for .25, .5, and .75 without rounding to 0.1', async () => {
    const quarterHourEntries = [
      {
        id: 'te-qh-1',
        user_id: 'u-1',
        machine_id: 'm-1',
        order_number: 'M-1001',
        entry_type: 'production' as const,
        project_task_id: 'task-1',
        task_name: 'Mechanical Assembly',
        work_date: '2026-10-19',
        hours_spent: 0.25,
        created_at: '2026-10-19T08:00:00Z',
        updated_at: '2026-10-19T08:00:00Z',
      },
      {
        id: 'te-qh-2',
        user_id: 'u-1',
        machine_id: 'm-1',
        order_number: 'M-1001',
        entry_type: 'production' as const,
        project_task_id: 'task-1',
        task_name: 'Mechanical Assembly',
        work_date: '2026-10-20',
        hours_spent: 0.5,
        created_at: '2026-10-20T08:00:00Z',
        updated_at: '2026-10-20T08:00:00Z',
      },
    ];

    (fetchApi as any).mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('timesheets/weekly')) {
        return Promise.resolve({
          ...mockWeeklyTimesheet,
          total_hours: 0.75,
          entries: quarterHourEntries,
        });
      }
      if (endpoint === 'machines') return Promise.resolve(mockMachines);
      if (endpoint === 'time-entries/my') return Promise.resolve(quarterHourEntries);
      if (endpoint.startsWith('department-tasks')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<TimesheetPage />);
    });

    // Row total and grand total should be 0.75h, not rounded to 0.8h
    expect(screen.getAllByText('0.75h').length).toBeGreaterThan(0);
    // Daily totals should be 0.25h and 0.5h, not 0.3h
    expect(screen.getAllByText('0.25h').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.5h').length).toBeGreaterThan(0);
    // 0.8h and 0.3h must NOT appear
    expect(screen.queryByText('0.8h')).not.toBeInTheDocument();
    expect(screen.queryByText('0.3h')).not.toBeInTheDocument();
  });

  it('toggles to Quoting & Variance tab and displays task quoting metrics', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const varianceTabBtn = screen.getByRole('button', { name: /Quoting & Variance/i });
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

    const deptTabBtn = screen.getByRole('button', { name: /Department Tasks/i });
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

  it('allows adding a new row to weekly timesheet matrix with inline machine and task selection', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    // Verify Add Row button is no longer on the top side
    expect(screen.queryByTitle('Add a new row to the timesheet')).not.toBeInTheDocument();

    // Space just below the last row in the grid creates a new row
    const addRowSlot = screen.getByLabelText(/Add row/i);
    await act(async () => {
      fireEvent.click(addRowSlot);
    });

    // Ensure machines are loaded and present in the inline select options
    expect(await screen.findAllByText(/M-1001 \(Centrifugal Feeder\)/i)).not.toHaveLength(0);

    // Select Machine M-1001 on the newly added row (index 1)
    const machineSelects = screen.getAllByLabelText(/Machine \/ Order #/i);
    expect(machineSelects.length).toBe(2);
    await act(async () => {
      fireEvent.change(machineSelects[1], { target: { value: 'm-1' } });
    });

    // Machine tasks should be loaded asynchronously and displayed in task select
    expect(await screen.findAllByText(/\[assembly\] Mechanical Assembly \((Quoted|Budget): 40h\)/i)).not.toHaveLength(0);

    // Select the task on newly added row
    const taskSelects = screen.getAllByLabelText(/Task \/ Allocation Target/i);
    await act(async () => {
      fireEvent.change(taskSelects[1], { target: { value: 'dept:dt-1' } });
    });

    // User can directly add hours across the week (Sunday is day 1)
    const mondayInputs = screen.getAllByLabelText(/Mechanical Assembly on Monday/i);
    await act(async () => {
      fireEvent.change(mondayInputs[1], { target: { value: '3.5' } });
    });

    // Should now have 3.5h row total
    expect(screen.getAllByText('3.5h').length).toBeGreaterThan(0);
  });

  it('supports project-level department scope and distills task options', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const varianceTabBtn = screen.getByRole('button', { name: /Quoting & Variance/i });
    await act(async () => {
      fireEvent.click(varianceTabBtn);
    });

    // Project Context Bar has Department Scope
    const projectDeptSelect = screen.getByLabelText(/Department Scope:/i);
    expect(projectDeptSelect).toHaveValue('all');

    // Open task assignment panel
    const assignBtn = screen.getByText('+ Assign Task to Project');
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

    const varianceTabBtn = screen.getByRole('button', { name: /Quoting & Variance/i });
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

  it('renders Weekly Timesheet grid with daily allocations and draft controls', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    // Weekly grid controls
    expect(screen.getByText('Save Timesheet')).toBeInTheDocument();
    expect(screen.getAllByText(/SAVED/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Total Logged This Week:')).toBeInTheDocument();
  });

  it('toggles to Approvals tab and allows lead to review timesheets', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const approvalsTabBtn = screen.getByRole('button', { name: /Approvals/i });
    await act(async () => {
      fireEvent.click(approvalsTabBtn);
    });

    expect(screen.getByText('◀ Prev Week')).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.getByText('🔄 Refresh List')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();

    // Click Review button to expand child breakdown for that worker
    const reviewBtn = screen.getByText('Review');
    await act(async () => {
      fireEvent.click(reviewBtn);
    });

    // Inline child row should expand with worker comments and simplified breakdown without redundant meta header or date controls
    expect(screen.getByText(/💬 Worker Comments:/i)).toBeInTheDocument();
    expect(screen.getAllByText('Draft note').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Reviewing Timesheet:/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Close ✕')).not.toBeInTheDocument();

    // Verify row button toggles to Hide Details
    const hideBtn = screen.getByText('Hide Details');
    await act(async () => {
      fireEvent.click(hideBtn);
    });

    // Verify collapsing details hides worker comments and restores Review button
    expect(screen.queryByText(/💬 Worker Comments:/i)).not.toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows delete button only for admins in the approvals view and hides it for managers', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u-mgr', username: 'leaduser', role: 'manager' },
      isAdmin: false,
      hasRole: vi.fn().mockImplementation((roles: string[]) => roles.includes('manager')),
    });

    await act(async () => {
      render(<TimesheetPage />);
    });

    const approvalsTabBtn = screen.getByRole('button', { name: /Approvals/i });
    await act(async () => {
      fireEvent.click(approvalsTabBtn);
    });

    // Manager can approve, reject, review
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();

    // But manager CANNOT delete
    expect(screen.queryByText(/Delete/i)).not.toBeInTheDocument();
  });

  it('refactors approvals into a work week view with week selection, department filtering, and list refresh', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const approvalsTabBtn = screen.getByRole('button', { name: /Approvals/i });
    await act(async () => {
      fireEvent.click(approvalsTabBtn);
    });

    // Verify Work Week navigation controls
    expect(screen.getByText('◀ Prev Week')).toBeInTheDocument();
    expect(screen.getByText('Next Week ▶')).toBeInTheDocument();

    // Verify Department & Status filters and Refresh button
    const deptSelect = screen.getByLabelText('Department');
    expect(deptSelect).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh List/i })).toBeInTheDocument();

    // Change Department filter to assembly
    await act(async () => {
      fireEvent.change(deptSelect, { target: { value: 'assembly' } });
    });

    // Navigate to previous work week via Prev Week button
    const prevWeekBtn = screen.getByText('◀ Prev Week');
    await act(async () => {
      fireEvent.click(prevWeekBtn);
    });

    // Verify fetchApi was called for timesheets/approvals with department and week_start parameters
    expect(fetchApi).toHaveBeenCalledWith(
      'timesheets/approvals',
      expect.objectContaining({
        params: expect.objectContaining({
          department: 'assembly',
          week_start: expect.any(String),
        }),
      })
    );

    // Click Refresh List button
    const refreshBtn = screen.getByRole('button', { name: /Refresh List/i });
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    // Verify fetchApi was called again on refresh
    expect(fetchApi).toHaveBeenCalledWith(
      'timesheets/approvals',
      expect.objectContaining({
        params: expect.objectContaining({
          department: 'assembly',
          week_start: expect.any(String),
        }),
      })
    );
  });

  it('displays clean Timesheet Approved banner without lengthy payroll text when approved', async () => {
    (fetchApi as any).mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('timesheets/weekly')) {
        return Promise.resolve({
          ...mockWeeklyTimesheet,
          status: 'approved',
          total_hours: 4.5,
        });
      }
      if (endpoint === 'machines') return Promise.resolve(mockMachines);
      if (endpoint === 'time-entries/my') return Promise.resolve(mockTimeEntries);
      if (endpoint.startsWith('department-tasks')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<TimesheetPage />);
    });

    // Check banner contains clean "Timesheet Approved"
    expect(screen.getByText('Timesheet Approved')).toBeInTheDocument();
    // Lengthy text should NOT be present
    expect(screen.queryByText(/permanently locked into payroll ledger/i)).not.toBeInTheDocument();
  });

  it('allows user to edit saved timesheet until approved', async () => {
    (fetchApi as any).mockImplementation((endpoint: string, options?: any) => {
      if (endpoint.startsWith('timesheets/weekly')) {
        return Promise.resolve({
          ...mockWeeklyTimesheet,
          status: 'draft',
          total_hours: 4.5,
        });
      }
      if (endpoint === 'machines') return Promise.resolve(mockMachines);
      if (endpoint === 'time-entries/my') return Promise.resolve(mockTimeEntries);
      if (endpoint.startsWith('department-tasks')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<TimesheetPage />);
    });

    // Inputs should NOT be disabled
    const mondayInput = screen.getByLabelText(/Mechanical Assembly on Monday/i);
    expect(mondayInput).not.toBeDisabled();

    // Save button should be available
    expect(screen.getByText('Save Timesheet')).toBeInTheDocument();
  });

  it('filters task options in the entry grid to user department', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u-1', username: 'assembler1', role: 'technician', department: 'assembly' },
      isAdmin: false,
      hasRole: vi.fn().mockReturnValue(false),
    });

    await act(async () => {
      render(<TimesheetPage />);
    });

    // The grid loads mockWeeklyTimesheet which has machine m-1
    const taskSelects = screen.getAllByLabelText('Task / Allocation Target');
    expect(taskSelects.length).toBeGreaterThan(0);
    const select = taskSelects[0] as HTMLSelectElement;

    // Check options inside select
    const optionTexts = Array.from(select.options).map(o => o.text);
    // Assembly tasks should be present
    expect(optionTexts.some(t => t.includes('Mechanical Assembly'))).toBe(true);
    // Controls tasks should NOT be present
    expect(optionTexts.some(t => t.includes('Panel Wiring'))).toBe(false);
    expect(optionTexts.some(t => t.includes('PLC Programming'))).toBe(false);

    // Verify no separate optgroups for "Quoted Tasks Allocated by Lead" vs "Core Department Tasks"
    expect(screen.queryByText(/Core Department Tasks/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quoted Tasks Allocated by Lead/i)).not.toBeInTheDocument();
  });

  it('renders dynamic rework traveler dropdown when entry type is changed to rework', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const typeSelects = screen.getAllByLabelText('Type');
    expect(typeSelects.length).toBeGreaterThan(0);

    // Switch entry type to rework on the first row
    await act(async () => {
      fireEvent.change(typeSelects[0], { target: { value: 'rework' } });
    });

    // Rework Traveler select should now be visible
    const reworkSelect = screen.getByLabelText('Rework / Allocation Target') as HTMLSelectElement;
    expect(reworkSelect).toBeInTheDocument();

    const options = Array.from(reworkSelect.options).map(o => o.text);
    expect(options.some(t => t.includes('RW-PART-100') && t.includes('Shaft realignment'))).toBe(true);

    // Select the rework item
    await act(async () => {
      fireEvent.change(reworkSelect, { target: { value: 'rw-1' } });
    });

    expect(reworkSelect.value).toBe('rw-1');
  });

  it('renders dynamic defect dropdown when entry type is changed to issue_fix', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const typeSelects = screen.getAllByLabelText('Type');
    expect(typeSelects.length).toBeGreaterThan(0);

    // Switch entry type to issue_fix on the first row
    await act(async () => {
      fireEvent.change(typeSelects[0], { target: { value: 'issue_fix' } });
    });

    // Defect select should now be visible
    const defectSelect = screen.getByLabelText('Defect / Allocation Target') as HTMLSelectElement;
    expect(defectSelect).toBeInTheDocument();

    const options = Array.from(defectSelect.options).map(o => o.text);
    expect(options.some(t => t.includes('Loose sensor bracket'))).toBe(true);

    // Select the defect
    await act(async () => {
      fireEvent.change(defectSelect, { target: { value: 'def-1' } });
    });

    expect(defectSelect.value).toBe('def-1');
  });

  it('opens the printable timesheet modal when Print button is clicked', async () => {
    await act(async () => {
      render(<TimesheetPage />);
    });

    const printBtn = screen.getByRole('button', { name: /Print/i });
    expect(printBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(printBtn);
    });

    expect(screen.getByText('Print Weekly Timesheet')).toBeInTheDocument();
    expect(screen.getAllByText('Weekly Job Schedule').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Job allocation approved by').length).toBeGreaterThanOrEqual(1);
  });
});


