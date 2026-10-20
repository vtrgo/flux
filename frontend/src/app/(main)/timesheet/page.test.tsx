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

    const varianceTabBtn = screen.getByText('📊 Quoting & Variance');
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

    const approvalsTabBtn = screen.getByText('✅ Approvals');
    await act(async () => {
      fireEvent.click(approvalsTabBtn);
    });

    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('🔄 Refresh List')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();

    // Click Review button to open modal for that worker
    const reviewBtn = screen.getByText('Review');
    await act(async () => {
      fireEvent.click(reviewBtn);
    });

    // Review modal should open with the worker's name and read-only view
    expect(screen.getByText(/Reviewing Timesheet:/i)).toBeInTheDocument();
    expect(screen.getByText('Close ✕')).toBeInTheDocument();

    // Verify review modal header has Approve and Reject, but NOT Delete
    const closeBtn = screen.getByText('Close ✕');
    const modalActionGroup = closeBtn.parentElement;
    expect(modalActionGroup).not.toBeNull();
    expect(within(modalActionGroup!).queryByText(/Delete/i)).not.toBeInTheDocument();
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

    const approvalsTabBtn = screen.getByText('✅ Approvals');
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
});


