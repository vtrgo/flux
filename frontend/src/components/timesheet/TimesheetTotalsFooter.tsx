"use client";

import React, { memo } from 'react';
import { formatHours } from '../../lib/dateUtils';
import styles from '../WeeklyTimesheetGrid.module.css';

interface DayInfo {
  dateStr: string;
  dayName: string;
  shortDate: string;
  fullName: string;
}

interface TimesheetTotalsFooterProps {
  weekDays: DayInfo[];
  dayTotals: Record<string, number>;
  grandTotal: number;
  isLocked: boolean;
}

export const TimesheetTotalsFooter = memo(function TimesheetTotalsFooter({
  weekDays,
  dayTotals,
  grandTotal,
  isLocked,
}: TimesheetTotalsFooterProps) {
  return (
    <tfoot>
      <tr className={styles.footerRow}>
        <td colSpan={4} style={{ textAlign: 'right', paddingRight: '1rem' }}>
          Daily Total:
        </td>
        {weekDays.map(day => (
          <td key={day.dateStr} style={{ textAlign: 'center' }}>
            {formatHours(dayTotals[day.dateStr] || 0)}h
          </td>
        ))}
        <td className={`${styles.rowTotal} ${styles.grandTotal}`}>
          {formatHours(grandTotal)}h
        </td>
        {!isLocked && <td></td>}
      </tr>
    </tfoot>
  );
});
