"use client";

import React, { useMemo } from 'react';
import {
  WeeklyTimesheet,
  PrintableTimesheetRow,
  TimesheetPrintParams,
  TimesheetRowPrintData,
  TimesheetDayCol,
} from '../types';
import { getWeekDays, formatHours } from '../lib/dateUtils';
import styles from './PrintableWeeklyTimesheet.module.css';

export type { PrintableTimesheetRow };

export interface PrintableWeeklyTimesheetProps {
  timesheet?: WeeklyTimesheet | null;
  employeeName?: string;
  department?: string;
  weekStartDate: string; // ISO Sunday 'YYYY-MM-DD'
  rows?: PrintableTimesheetRow[];
  totalTargetRows?: number;
  notes?: string;
}

export function buildTimesheetPrintParams(
  timesheet?: WeeklyTimesheet | null,
  employeeName?: string,
  department?: string,
  weekStartDate: string = '',
  explicitRows?: PrintableTimesheetRow[],
  totalTargetRows: number = 15,
  notes?: string
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
      const asmCode = entry.assembly_code || '';
      const asmName = entry.assembly_name || '';
      const taskName = entry.task_name || (entry.rework_part_number ? `Rework: ${entry.rework_part_number}` : 'General Task');
      const key = `${orderNum}:${asmCode}:${taskName}:${entry.entry_type || 'production'}`;

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          rowKey: key,
          order_number: orderNum || undefined,
          assembly_code: asmCode || undefined,
          assembly_name: asmName || undefined,
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
    const orderNumber = r.order_number || (r.task_name ? 'Shop / Indirect' : '');
    const assemblyLabel = r.assembly_code
      ? `[${r.assembly_code}] ${r.assembly_name || ''}`.trim()
      : r.order_number ? 'General' : '—';
    const taskName = r.task_name || 'General Task';
    const jobLabel = r.order_number
      ? `${r.order_number}${assemblyLabel && assemblyLabel !== 'General' ? ` ${assemblyLabel}` : ''} - ${taskName}`
      : taskName;

    return {
      orderNumber,
      assemblyLabel,
      taskName,
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
    notes: (notes && notes.trim()) || (timesheet?.notes && timesheet.notes.trim()) || undefined,
  };
}

export function PrintableWeeklyTimesheet({
  timesheet,
  employeeName,
  department,
  weekStartDate,
  rows: explicitRows,
  totalTargetRows = 15,
  notes: notesProp,
}: PrintableWeeklyTimesheetProps) {
  const printData = useMemo(() => {
    return buildTimesheetPrintParams(
      timesheet,
      employeeName,
      department,
      weekStartDate,
      explicitRows,
      totalTargetRows,
      notesProp
    );
  }, [timesheet, employeeName, department, weekStartDate, explicitRows, totalTargetRows, notesProp]);

  const {
    employeeName: effectiveEmployeeName,
    weekEndingDate: weekEndingFormatted,
    weekDays,
    rows: activeRows,
    dayTotals,
    grandTotal,
    isOvertime,
    approvalDate: approvalDateFormatted,
    isApproved,
    approverName,
    status,
    timesheetId,
    notes,
  } = printData;

  const blankRowsCount = Math.max(0, totalTargetRows - activeRows.length);
  const blankRows = useMemo(() => {
    return Array.from({ length: blankRowsCount }, (_, i) => `blank-row-${i}`);
  }, [blankRowsCount]);

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.sheet} ${styles.printableRoot}`} data-testid="printable-timesheet">
        {/* Header Section */}
        <table className={styles.headerTable}>
          <tbody>
            <tr>
              <td className={styles.employeeNameCell}>
                EMPLOYEE NAME:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{effectiveEmployeeName}
                {department && (
                  <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#555', marginLeft: '12px' }}>
                    ({department})
                  </span>
                )}
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
          </tbody>
        </table>

        {/* Matrix Grid */}
        <table className={styles.gridTable} data-testid="timesheet-grid-table">
          <thead>
            {/* Row 4: Days */}
            <tr>
              <th className={`${styles.colProject} ${styles.thDayName}`}>Project / Order #</th>
              <th className={`${styles.colAssembly} ${styles.thDayName}`}>Assembly</th>
              <th className={`${styles.colTask} ${styles.thDayName}`}>Task Description</th>
              {weekDays.map(day => (
                <th key={day.dateStr} className={`${styles.colDay} ${styles.thDayName}`}>
                  {day.dayName}
                </th>
              ))}
              <th className={`${styles.colTotal} ${styles.thDayName}`}>Total</th>
            </tr>
            {/* Row 5: Dates */}
            <tr>
              <th colSpan={3} className={`${styles.colSegmentSpan} ${styles.thDateLabel}`}>Date</th>
              {weekDays.map(day => (
                <th key={day.dateStr} className={`${styles.colDay} ${styles.thDateValue}`}>
                  {day.mdFormatted}
                </th>
              ))}
              <th className={`${styles.colTotal} ${styles.thDateValue}`}></th>
            </tr>
          </thead>
          <tbody>
            {/* Active Job Rows */}
            {activeRows.map((row, idx) => (
              <tr key={`job-${idx}`} className={styles.rowJob}>
                <td className={styles.colProject} title={row.orderNumber || ''}>
                  <span className={`${styles.cellText} ${styles.boldText}`}>{row.orderNumber || '—'}</span>
                </td>
                <td className={styles.colAssembly} title={row.assemblyLabel || ''}>
                  <span className={styles.cellText}>{row.assemblyLabel || '—'}</span>
                </td>
                <td className={styles.colTask} title={row.taskName || row.jobLabel}>
                  <span className={styles.cellText}>{row.taskName || row.jobLabel}</span>
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
                  {row.rowTotal > 0 ? formatHours(row.rowTotal) : '0'}
                </td>
              </tr>
            ))}

            {/* Padded Blank Rows for Write-Ins */}
            {blankRows.map(id => (
              <tr key={id} className={styles.rowBlank}>
                <td className={styles.colProject}>&nbsp;</td>
                <td className={styles.colAssembly}>&nbsp;</td>
                <td className={styles.colTask}>&nbsp;</td>
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
              <td colSpan={3} className={`${styles.colSegmentSpan} ${styles.labelTotal}`}>TOTAL</td>
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

        {/* Comments, Notes & Remarks Section */}
        <div className={styles.commentsBox}>
          <div className={styles.commentsHeader}>Comments / Notes &amp; Remarks</div>
          <div className={styles.commentsBody}>
            {notes ? (
              <div className={styles.commentsText}>{notes}</div>
            ) : null}
            <div className={styles.commentsLines}>
              {Array.from({ length: notes ? 3 : 5 }).map((_, idx) => (
                <div key={idx} className={styles.commentRule}></div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className={styles.footerContainer}>
          <div className={styles.systemAuditLine}>
            <span>
              Flux MES &bull; Timesheet ID: {timesheetId ? timesheetId.slice(0, 8) : 'NEW'} &bull; Status: {(status || 'draft').toUpperCase()}
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
