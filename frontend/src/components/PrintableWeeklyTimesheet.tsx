"use client";

import React, { useMemo } from 'react';
import { WeeklyTimesheet, TimeEntryType } from '../types';
import { getWeekDays, formatHours } from '../lib/dateUtils';
import { TimesheetPrintParams, TimesheetRowPrintData, TimesheetDayCol } from '../lib/printTimesheet';
import styles from './PrintableWeeklyTimesheet.module.css';

export interface PrintableTimesheetRow {
  rowKey?: string;
  order_number?: string;
  task_name: string;
  department?: string;
  entry_type?: TimeEntryType;
  days: Record<string, number | undefined>; // dateStr -> hours
}

export interface PrintableWeeklyTimesheetProps {
  timesheet?: WeeklyTimesheet | null;
  employeeName?: string;
  department?: string;
  weekStartDate: string; // ISO Sunday 'YYYY-MM-DD'
  rows?: PrintableTimesheetRow[];
  totalTargetRows?: number;
}

export function buildTimesheetPrintParams(
  timesheet?: WeeklyTimesheet | null,
  employeeName?: string,
  department?: string,
  weekStartDate: string = '',
  explicitRows?: PrintableTimesheetRow[],
  totalTargetRows: number = 18
): TimesheetPrintParams {
  const weekDays = getWeekDays(weekStartDate);
  const saturdayDateStr = weekDays[6]?.dateStr || '';
  let weekEndingFormatted = '';
  if (saturdayDateStr) {
    const [y, m, d] = saturdayDateStr.split('-');
    weekEndingFormatted = `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
  }

  const timesheetUserName = timesheet?.user_name;
  const effectiveEmployeeName =
    (employeeName && employeeName.trim()) ||
    (timesheetUserName && timesheetUserName.trim()) ||
    'Lucas Sinclair';

  let effectiveRows: PrintableTimesheetRow[] = [];
  if (explicitRows && explicitRows.length > 0) {
    effectiveRows = explicitRows;
  } else if (timesheet && Array.isArray(timesheet.entries) && timesheet.entries.length > 0) {
    const rowMap = new Map<string, PrintableTimesheetRow>();
    timesheet.entries.forEach(entry => {
      const orderNum = entry.order_number || '';
      const taskName = entry.task_name || (entry.rework_part_number ? `Rework: ${entry.rework_part_number}` : 'General Task');
      const key = `${orderNum}:${taskName}:${entry.entry_type || 'production'}`;

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          rowKey: key,
          order_number: orderNum || undefined,
          task_name: taskName,
          department: entry.department,
          entry_type: entry.entry_type,
          days: {},
        });
      }

      const r = rowMap.get(key)!;
      r.days[entry.work_date] = (r.days[entry.work_date] || 0) + entry.hours_spent;
    });
    effectiveRows = Array.from(rowMap.values());
  }

  const activeRows = effectiveRows.filter(r => {
    const hasHours = Object.values(r.days).some(h => (h || 0) > 0);
    return hasHours || Boolean(r.order_number || r.task_name);
  });

  const dayTotals: Record<string, number> = {};
  weekDays.forEach(day => {
    dayTotals[day.dateStr] = activeRows.reduce<number>((sum, r) => sum + (r.days[day.dateStr] || 0), 0);
  });

  const grandTotal = Object.values(dayTotals).reduce((sum, h) => sum + h, 0);

  const printRows: TimesheetRowPrintData[] = activeRows.map(r => {
    const rowTotal = Object.values(r.days).reduce<number>((s, h) => s + (h || 0), 0);
    const jobLabel = r.order_number
      ? `${r.order_number}${r.task_name ? ` - ${r.task_name}` : ''}`
      : r.task_name || 'General Task';
    return {
      jobLabel,
      days: r.days,
      rowTotal,
    };
  });

  const weekDayCols: TimesheetDayCol[] = weekDays.map(day => {
    const [, m, d] = day.dateStr.split('-');
    return {
      dateStr: day.dateStr,
      dayName: day.dayName,
      mdFormatted: `${parseInt(m, 10)}/${parseInt(d, 10)}`,
    };
  });

  let approvalDateFormatted = '';
  if (timesheet?.approved_at) {
    try {
      const d = new Date(timesheet.approved_at);
      approvalDateFormatted = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    } catch {
      approvalDateFormatted = '';
    }
  }

  return {
    employeeName: effectiveEmployeeName,
    department,
    weekEndingDate: weekEndingFormatted,
    weekDays: weekDayCols,
    rows: printRows,
    totalTargetRows,
    dayTotals,
    grandTotal,
    isOvertime: grandTotal > 40,
    timesheetId: timesheet?.id,
    status: timesheet?.status || 'draft',
    isApproved: timesheet?.status === 'approved',
    approverName: timesheet?.approver_name,
    approvalDate: approvalDateFormatted,
  };
}

export function PrintableWeeklyTimesheet({
  timesheet,
  employeeName,
  department,
  weekStartDate,
  rows: explicitRows,
  totalTargetRows = 18,
}: PrintableWeeklyTimesheetProps) {
  const weekDays = useMemo(() => getWeekDays(weekStartDate), [weekStartDate]);

  // Saturday is the week ending date (day index 6)
  const saturdayDateStr = weekDays[6]?.dateStr || '';
  const weekEndingFormatted = useMemo(() => {
    if (!saturdayDateStr) return '';
    const [y, m, d] = saturdayDateStr.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
  }, [saturdayDateStr]);

  // Displayed employee name
  const timesheetUserName = timesheet?.user_name;
  const effectiveEmployeeName = useMemo(() => {
    if (employeeName && employeeName.trim()) return employeeName;
    if (timesheetUserName && timesheetUserName.trim()) return timesheetUserName;
    return 'Lucas Sinclair';
  }, [employeeName, timesheetUserName]);

  // Aggregate rows if not explicitly provided
  const effectiveRows: PrintableTimesheetRow[] = useMemo(() => {
    if (explicitRows && explicitRows.length > 0) {
      return explicitRows;
    }

    if (timesheet && Array.isArray(timesheet.entries) && timesheet.entries.length > 0) {
      const rowMap = new Map<string, PrintableTimesheetRow>();
      timesheet.entries.forEach(entry => {
        const orderNum = entry.order_number || '';
        const taskName = entry.task_name || (entry.rework_part_number ? `Rework: ${entry.rework_part_number}` : 'General Task');
        const key = `${orderNum}:${taskName}:${entry.entry_type || 'production'}`;

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            rowKey: key,
            order_number: orderNum || undefined,
            task_name: taskName,
            department: entry.department,
            entry_type: entry.entry_type,
            days: {},
          });
        }

        const r = rowMap.get(key)!;
        r.days[entry.work_date] = (r.days[entry.work_date] || 0) + entry.hours_spent;
      });
      return Array.from(rowMap.values());
    }

    return [];
  }, [explicitRows, timesheet]);

  // Filter out completely blank rows from active list before padding
  const activeRows = useMemo(() => {
    return effectiveRows.filter(r => {
      const hasHours = Object.values(r.days).some(h => (h || 0) > 0);
      return hasHours || Boolean(r.order_number || r.task_name);
    });
  }, [effectiveRows]);

  // Daily totals
  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    weekDays.forEach(day => {
      totals[day.dateStr] = activeRows.reduce<number>((sum, r) => sum + (r.days[day.dateStr] || 0), 0);
    });
    return totals;
  }, [activeRows, weekDays]);

  // Grand total
  const grandTotal = useMemo(() => {
    return Object.values(dayTotals).reduce((sum, h) => sum + h, 0);
  }, [dayTotals]);

  // Blank rows needed to match reference document full-page appearance
  const blankRowsCount = Math.max(0, totalTargetRows - activeRows.length);
  const blankRows = useMemo(() => {
    return Array.from({ length: blankRowsCount }, (_, i) => `blank-row-${i}`);
  }, [blankRowsCount]);

  const isOvertime = grandTotal > 40;

  // Format digital approval date if present
  const approvedAt = timesheet?.approved_at;
  const approvalDateFormatted = useMemo(() => {
    if (!approvedAt) return '';
    try {
      const d = new Date(approvedAt);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }, [approvedAt]);

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.sheet} ${styles.printableRoot}`} data-testid="printable-timesheet">
        {/* Header Section */}
        <table className={styles.headerTable}>
          <tbody>
            <tr>
              <td className={styles.employeeNameCell}>
                EMPLOYEE NAME:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{effectiveEmployeeName}
                {department && <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#555', marginLeft: '12px' }}>({department})</span>}
              </td>
              <td className={styles.scheduleTitleCell}>
                Weekly Job Schedule
              </td>
            </tr>
            <tr>
              <td colSpan={2} className={styles.weekEndingCell}>
                Week Ending:&nbsp;&nbsp;<strong>{weekEndingFormatted}</strong>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className={styles.instructionCell}>
                Please add brackets () to time over 40 hours
              </td>
            </tr>
          </tbody>
        </table>

        {/* Matrix Grid */}
        <table className={styles.gridTable} data-testid="timesheet-grid-table">
          <thead>
            {/* Row 4: Days */}
            <tr>
              <th className={`${styles.colJob} ${styles.thDayName}`}>Job # &amp; Segment</th>
              {weekDays.map(day => (
                <th key={day.dateStr} className={`${styles.colDay} ${styles.thDayName}`}>
                  {day.dayName}
                </th>
              ))}
              <th className={`${styles.colTotal} ${styles.thDayName}`}>Total</th>
            </tr>
            {/* Row 5: Dates */}
            <tr>
              <th className={`${styles.colJob} ${styles.thDateLabel}`}>Date</th>
              {weekDays.map(day => {
                const [, m, d] = day.dateStr.split('-');
                const mdFormatted = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
                return (
                  <th key={day.dateStr} className={`${styles.colDay} ${styles.thDateValue}`}>
                    {mdFormatted}
                  </th>
                );
              })}
              <th className={`${styles.colTotal} ${styles.thDateValue}`}></th>
            </tr>
          </thead>
          <tbody>
            {/* Active Job Rows */}
            {activeRows.map((row, idx) => {
              const rowTotal = Object.values(row.days).reduce<number>((s, h) => s + (h || 0), 0);
              const jobLabel = row.order_number
                ? `${row.order_number}${row.task_name ? ` - ${row.task_name}` : ''}`
                : row.task_name || 'General Task';

              return (
                <tr key={row.rowKey || `job-${idx}`} className={styles.rowJob}>
                  <td className={styles.colJob} title={jobLabel}>
                    <span className={styles.jobName}>{jobLabel}</span>
                  </td>
                  {weekDays.map(day => {
                    const hours = row.days[day.dateStr];
                    return (
                      <td key={day.dateStr} className={`${styles.colDay} ${styles.cellHours}`}>
                        {hours !== undefined && hours > 0 ? formatHours(hours) : ''}
                      </td>
                    );
                  })}
                  <td className={`${styles.colTotal} ${styles.cellRowTotal}`}>
                    {rowTotal > 0 ? formatHours(rowTotal) : '0'}
                  </td>
                </tr>
              );
            })}

            {/* Padded Blank Rows for Write-Ins */}
            {blankRows.map(id => (
              <tr key={id} className={styles.rowBlank}>
                <td className={styles.colJob}>&nbsp;</td>
                {weekDays.map(day => (
                  <td key={day.dateStr} className={styles.colDay}></td>
                ))}
                <td className={`${styles.colTotal} ${styles.cellRowTotal}`}>0</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Totals Row */}
            <tr className={styles.rowTotals}>
              <td className={`${styles.colJob} ${styles.labelTotal}`}>TOTAL</td>
              {weekDays.map(day => {
                const total = dayTotals[day.dateStr] || 0;
                return (
                  <td key={day.dateStr} className={`${styles.colDay} ${styles.cellDayTotal}`}>
                    {formatHours(total)}
                  </td>
                );
              })}
              <td className={`${styles.colTotal} ${styles.cellGrandTotal}`}>
                {isOvertime ? (
                  <span className={styles.overtimeBracket}>({formatHours(grandTotal)})</span>
                ) : (
                  formatHours(grandTotal)
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Footer & Approval Section */}
        <div className={styles.footerContainer}>
          <table className={styles.approvalTable}>
            <tbody>
              <tr>
                <td className={styles.approvalLabelCell}>
                  Job allocation approved by
                </td>
                <td className={styles.approvalBoxCell}>
                  <div className={styles.signatureLines}>
                    <div className={styles.sigRow}>
                      <span>Signature:</span>
                      <div className={styles.sigUnderline}></div>
                    </div>
                    <div className={styles.sigRow}>
                      <span>Date:</span>
                      <div className={styles.sigUnderline} style={{ maxWidth: '120px' }}></div>
                    </div>
                  </div>

                  {timesheet?.status === 'approved' && (
                    <div className={styles.digitalApprovalStamp}>
                      <span>✅</span>
                      <span>
                        Digitally Approved in Flux by <strong>{timesheet.approver_name || 'Department Manager'}</strong>
                        {approvalDateFormatted ? ` on ${approvalDateFormatted}` : ''}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className={styles.deliveryNotice}>
            Approved timesheets must be delivered to Lisa every Monday morning
          </div>

          <div className={styles.systemAuditLine}>
            <span>
              Flux MES &bull; Timesheet ID: {timesheet?.id ? timesheet.id.slice(0, 8) : 'NEW'} &bull; Status: {(timesheet?.status || 'draft').toUpperCase()}
            </span>
            <span>
              Generated: {new Date().toLocaleDateString('en-US')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
