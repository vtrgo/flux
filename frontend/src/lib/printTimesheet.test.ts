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
    totalTargetRows: 18,
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
    expect(html).toContain('Please add brackets () to time over 40 hours');
    expect(html).toContain('22-003A1 - EP');
    expect(html).toContain('Shop');
    expect(html).toContain('Job allocation approved by');
    expect(html).toContain('Approved timesheets must be delivered to Lisa every Monday morning');
    expect(html).toContain('@page {');
    expect(html).toContain('size: letter portrait;');
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

  it('renders digital approval seal when timesheet is approved', () => {
    const approvedParams: TimesheetPrintParams = {
      ...mockParams,
      status: 'approved',
      isApproved: true,
      approverName: 'Sarah Connor',
      approvalDate: '10/24/2026',
    };

    const html = generateTimesheetHtml(approvedParams);
    expect(html).toContain('Digitally Approved in Flux by <strong>Sarah Connor</strong>');
    expect(html).toContain('on 10/24/2026');
  });

  it('prints via isolated iframe without errors', () => {
    const html = generateTimesheetHtml(mockParams);
    const success = printTimesheetDocument(html);
    expect(success).toBe(true);
  });
});
