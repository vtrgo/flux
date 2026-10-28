import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTimesheetHtml, printTimesheetDocument, TimesheetPrintParams } from './printTimesheet';

describe('printTimesheet utilities', () => {
  const mockParams: TimesheetPrintParams = {
    employeeName: 'Lucas Sinclair',
    department: 'assembly',
    weekEndingDate: '10/24/2026',
    weekDays: [
      { dateStr: '2026-10-18', dayName: 'Sun', mdFormatted: '10/18' },
      { dateStr: '2026-10-19', dayName: 'Mon', mdFormatted: '10/19' },
      { dateStr: '2026-10-20', dayName: 'Tue', mdFormatted: '10/20' },
      { dateStr: '2026-10-21', dayName: 'Wed', mdFormatted: '10/21' },
      { dateStr: '2026-10-22', dayName: 'Thu', mdFormatted: '10/22' },
      { dateStr: '2026-10-23', dayName: 'Fri', mdFormatted: '10/23' },
      { dateStr: '2026-10-24', dayName: 'Sat', mdFormatted: '10/24' },
    ],
    rows: [
      {
        jobLabel: '22-003A1 - EP',
        days: {
          '2026-10-19': 2.25,
          '2026-10-20': 4,
          '2026-10-21': 1,
        },
        rowTotal: 7.25,
      },
      {
        jobLabel: 'Shop',
        days: {
          '2026-10-19': 2,
          '2026-10-20': 2.5,
          '2026-10-21': 3,
          '2026-10-22': 2.25,
          '2026-10-23': 2,
          '2026-10-24': 3,
        },
        rowTotal: 14.75,
      },
    ],
    totalTargetRows: 10,
    dayTotals: {
      '2026-10-18': 0,
      '2026-10-19': 4.25,
      '2026-10-20': 6.5,
      '2026-10-21': 4,
      '2026-10-22': 2.25,
      '2026-10-23': 2,
      '2026-10-24': 3,
    },
    grandTotal: 22,
    isOvertime: false,
    timesheetId: 'wt-12345678',
    status: 'draft',
  };

  it('generates complete self-contained HTML document matching shop template', () => {
    const html = generateTimesheetHtml(mockParams);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('EMPLOYEE NAME:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Lucas Sinclair');
    expect(html).toContain('Weekly Job Schedule');
    expect(html).toContain('Week Ending:&nbsp;&nbsp;<strong>10/24/2026</strong>');
    expect(html).not.toContain('Please add brackets () to time over 40 hours');
    expect(html).toContain('Project / Order #');
    expect(html).toContain('Assembly');
    expect(html).toContain('Task Description');
    expect(html).toContain('22-003A1');
    expect(html).toContain('EP');
    expect(html).toContain('Shop');
    expect(html).not.toContain('Job allocation approved by');
    expect(html).not.toContain('Approved timesheets must be delivered to Lisa every Monday morning');
    expect(html).toContain('Comments / Notes &amp; Remarks');
    expect(html).toContain('@page {');
    expect(html).toContain('size: letter landscape;');
  });

  it('renders comments and remarks section with digital notes and write-in lines', () => {
    const paramsWithNotes: TimesheetPrintParams = {
      ...mockParams,
      notes: 'Completed conveyor assembly and aligned feeder track. Awaiting parts on Friday.',
    };

    const html = generateTimesheetHtml(paramsWithNotes);
    expect(html).toContain('Comments / Notes &amp; Remarks');
    expect(html).toContain('Completed conveyor assembly and aligned feeder track. Awaiting parts on Friday.');
    expect(html).toContain('commentRule');
  });

  it('renders explicit assembly labels and order numbers correctly in landscape columns', () => {
    const assemblyParams: TimesheetPrintParams = {
      ...mockParams,
      rows: [
        {
          orderNumber: '22-003A1',
          assemblyLabel: 'SUB-01 Electrical Panel',
          taskName: 'Wiring & Termination',
          jobLabel: '22-003A1 - SUB-01 - Wiring & Termination',
          days: { '2026-10-19': 5 },
          rowTotal: 5,
        },
      ],
      grandTotal: 5,
    };

    const html = generateTimesheetHtml(assemblyParams);
    expect(html).toContain('22-003A1');
    expect(html).toContain('SUB-01 Electrical Panel');
    expect(html).toContain('Wiring &amp; Termination');
    expect(html).toContain('size: letter landscape;');
  });

  it('formats overtime brackets () when isOvertime is true', () => {
    const overtimeParams: TimesheetPrintParams = {
      ...mockParams,
      grandTotal: 53,
      isOvertime: true,
    };

    const html = generateTimesheetHtml(overtimeParams);
    expect(html).toContain('(53)');
  });

  it('omits approval signature section and renders status audit line', () => {
    const approvedParams: TimesheetPrintParams = {
      ...mockParams,
      status: 'approved',
      isApproved: true,
      approverName: 'Sarah Connor',
      approvalDate: '10/24/2026',
    };

    const html = generateTimesheetHtml(approvedParams);
    expect(html).not.toContain('Job allocation approved by');
    expect(html).toContain('Status: APPROVED');
  });

  it('prints via isolated iframe without errors', () => {
    const html = generateTimesheetHtml(mockParams);
    const success = printTimesheetDocument(html);
    expect(success).toBe(true);
  });
});
