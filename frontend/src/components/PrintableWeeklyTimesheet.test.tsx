import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PrintableWeeklyTimesheet, PrintableTimesheetRow } from './PrintableWeeklyTimesheet';
import { TimesheetPrintModal } from './TimesheetPrintModal';
import { WeeklyTimesheet } from '../types';

describe('PrintableWeeklyTimesheet', () => {
  const mockTimesheet: WeeklyTimesheet = {
    id: 'wt-12345678-abcd',
    user_id: 'u-1',
    user_name: 'Lucas Sinclair',
    department: 'assembly',
    week_start_date: '2026-10-18', // Sunday
    status: 'draft',
    total_hours: 38.5,
    created_at: '2026-10-18T00:00:00Z',
    updated_at: '2026-10-23T00:00:00Z',
  };

  const mockRows: PrintableTimesheetRow[] = [
    {
      rowKey: 'row-1',
      order_number: '22-003A1',
      task_name: 'EP',
      days: {
        '2026-10-19': 2.25, // Mon
        '2026-10-20': 4,    // Tue
        '2026-10-21': 1,    // Wed
      },
    },
    {
      rowKey: 'row-2',
      task_name: 'Shop',
      days: {
        '2026-10-19': 2,
        '2026-10-20': 2.5,
        '2026-10-21': 3,
        '2026-10-22': 2.25,
        '2026-10-23': 2,
        '2026-10-24': 3,
      },
    },
  ];

  it('renders employee name, document title, and Saturday week ending date', () => {
    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        employeeName="Lucas Sinclair"
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    expect(screen.getByText(/EMPLOYEE NAME:/i)).toBeInTheDocument();
    expect(screen.getByText(/Lucas Sinclair/i)).toBeInTheDocument();
    expect(screen.getByText('Weekly Job Schedule')).toBeInTheDocument();
    // Week Ending Saturday date for 2026-10-18 is 2026-10-24 (10/24/2026)
    expect(screen.getByText('10/24/2026')).toBeInTheDocument();
    expect(screen.getByText('Please add brackets () to time over 40 hours')).toBeInTheDocument();
  });

  it('renders days of week header (Sun - Sat) and M/D calendar dates', () => {
    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      expect(screen.getByText(day)).toBeInTheDocument();
    });

    ['10/18', '10/19', '10/20', '10/21', '10/22', '10/23', '10/24'].forEach(date => {
      expect(screen.getByText(date)).toBeInTheDocument();
    });
  });

  it('renders job rows with machine numbers, tasks, and daily hours', () => {
    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    expect(screen.getByText('22-003A1 - EP')).toBeInTheDocument();
    expect(screen.getByText('Shop')).toBeInTheDocument();

    // Row 1 total = 2.25 + 4 + 1 = 7.25
    expect(screen.getByText('7.25')).toBeInTheDocument();
    // Row 2 total = 2 + 2.5 + 3 + 2.25 + 2 + 3 = 14.75
    expect(screen.getByText('14.75')).toBeInTheDocument();
  });

  it('pads with empty blank rows to match full page appearance for write-ins', () => {
    const { container } = render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
        totalTargetRows={18}
      />
    );

    // 2 active rows + 16 padded blank rows = 18 tbody rows in the matrix grid
    const gridTbody = container.querySelector('[data-testid="timesheet-grid-table"] tbody');
    expect(gridTbody?.children.length).toBe(18);
  });

  it('formats regular total when <= 40 hours without brackets', () => {
    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    // Total hours = 7.25 + 14.75 = 22
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('formats overtime grand total with brackets () when > 40 hours', () => {
    const overtimeRows: PrintableTimesheetRow[] = [
      ...mockRows,
      {
        rowKey: 'row-3',
        order_number: '22-045',
        task_name: 'EP',
        days: {
          '2026-10-19': 8,
          '2026-10-20': 8,
          '2026-10-21': 8,
          '2026-10-22': 8,
        },
      },
    ];

    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={overtimeRows}
      />
    );

    // 22 + 32 = 54 (> 40), so brackets are applied: (54)
    expect(screen.getByText('(54)')).toBeInTheDocument();
  });

  it('renders approval signature box and Lisa delivery notice', () => {
    render(
      <PrintableWeeklyTimesheet
        timesheet={mockTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    expect(screen.getByText('Job allocation approved by')).toBeInTheDocument();
    expect(screen.getByText(/Signature:/i)).toBeInTheDocument();
    expect(screen.getByText(/Date:/i)).toBeInTheDocument();
    expect(
      screen.getByText('Approved timesheets must be delivered to Lisa every Monday morning')
    ).toBeInTheDocument();
  });

  it('displays digital approval seal when timesheet has been approved in Flux', () => {
    const approvedTimesheet: WeeklyTimesheet = {
      ...mockTimesheet,
      status: 'approved',
      approved_by: 'mgr-1',
      approver_name: 'Sarah Connor',
      approved_at: '2026-10-24T14:30:00Z',
    };

    render(
      <PrintableWeeklyTimesheet
        timesheet={approvedTimesheet}
        weekStartDate="2026-10-18"
        rows={mockRows}
      />
    );

    expect(screen.getByText(/Digitally Approved in Flux by/i)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Connor/i)).toBeInTheDocument();
  });
});

describe('TimesheetPrintModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal dialog and triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const onClose = vi.fn();

    render(
      <TimesheetPrintModal
        isOpen={true}
        onClose={onClose}
        employeeName="Lucas Sinclair"
        weekStartDate="2026-10-18"
        rows={[]}
      />
    );

    expect(screen.getByText('Print Weekly Timesheet')).toBeInTheDocument();
    const printBtn = screen.getByRole('button', { name: /Print \/ Save as PDF/i });
    expect(printBtn).toBeInTheDocument();

    fireEvent.click(printBtn);

    // Verify isolated print iframe is created for document spooling
    const iframe = document.body.querySelector('iframe');
    expect(iframe).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
