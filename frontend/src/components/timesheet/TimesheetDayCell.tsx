"use client";

import React, { memo } from 'react';
import styles from '../WeeklyTimesheetGrid.module.css';

interface TimesheetDayCellProps {
  rowKey: string;
  taskName: string;
  dateStr: string;
  dayFullName: string;
  value: number | undefined;
  disabled: boolean;
  onChange: (rowKey: string, dateStr: string, valueStr: string) => void;
}

export const TimesheetDayCell = memo(function TimesheetDayCell({
  rowKey,
  taskName,
  dateStr,
  dayFullName,
  value,
  disabled,
  onChange,
}: TimesheetDayCellProps) {
  return (
    <td style={{ textAlign: 'center' }}>
      <input
        type="number"
        step="0.25"
        min="0"
        max="24"
        aria-label={`${taskName || 'Task'} on ${dayFullName}`}
        className={styles.cellInput}
        value={value !== undefined && value !== 0 ? value : ''}
        placeholder="—"
        disabled={disabled}
        onChange={e => onChange(rowKey, dateStr, e.target.value)}
      />
    </td>
  );
});
