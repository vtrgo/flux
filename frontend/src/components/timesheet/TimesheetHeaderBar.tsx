"use client";

import React, { memo } from 'react';
import { WeeklyTimesheet } from '../../types';
import { formatWeekRange } from '../../lib/dateUtils';
import styles from '../WeeklyTimesheetGrid.module.css';

interface TimesheetHeaderBarProps {
  hideDateNav: boolean;
  readOnlyUserView: boolean;
  currentWeekSunday: string;
  isCurrentWeek: boolean;
  weeklyTimesheet: WeeklyTimesheet | null;
  isLocked: boolean;
  saving: boolean;
  submitting: boolean;
  isDirty: boolean;
  grandTotal: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onOpenPrint: () => void;
  onSave: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
}

export const TimesheetHeaderBar = memo(function TimesheetHeaderBar({
  hideDateNav,
  readOnlyUserView,
  currentWeekSunday,
  isCurrentWeek,
  weeklyTimesheet,
  isLocked,
  saving,
  submitting,
  isDirty,
  grandTotal,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onOpenPrint,
  onSave,
  onSubmit,
  onWithdraw,
}: TimesheetHeaderBarProps) {
  if (readOnlyUserView) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button
          className={styles.navBtn}
          onClick={onOpenPrint}
          type="button"
          title="Print standard shop timesheet schedule"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <span>🖨️</span>
          <span>Print Timesheet</span>
        </button>
      </div>
    );
  }

  if (hideDateNav) {
    return null;
  }

  return (
    <div className={styles.topBar}>
      <div className={styles.weekNav}>
        <button
          className={styles.navBtn}
          onClick={onPrevWeek}
          title="Previous Week"
          type="button"
        >
          ◀ Prev Week
        </button>
        <span className={styles.weekLabel}>{formatWeekRange(currentWeekSunday)}</span>
        <button
          className={styles.navBtn}
          onClick={onNextWeek}
          title="Next Week"
          type="button"
        >
          Next Week ▶
        </button>
        {!isCurrentWeek && (
          <button
            className={styles.navBtn}
            onClick={onThisWeek}
            title="Jump to Current Week"
            type="button"
          >
            Current Week
          </button>
        )}
      </div>

      <div className={styles.statusAndActions}>
        {weeklyTimesheet && (
          <span
            className={`${styles.statusBadge} ${
              weeklyTimesheet.status === 'approved'
                ? styles.statusApproved
                : weeklyTimesheet.status === 'rejected'
                ? styles.statusRejected
                : weeklyTimesheet.total_hours > 0
                ? styles.statusSubmitted
                : styles.statusDraft
            }`}
          >
            {weeklyTimesheet.status === 'approved'
              ? 'APPROVED'
              : weeklyTimesheet.status === 'rejected'
              ? 'REJECTED'
              : weeklyTimesheet.total_hours > 0
              ? 'SAVED'
              : 'DRAFT'}
          </span>
        )}

        <button
          className={styles.navBtn}
          onClick={onOpenPrint}
          type="button"
          title="Print standard shop timesheet schedule"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <span>🖨️</span>
          <span>Print</span>
        </button>

        <button
          className={styles.btnPrimary}
          onClick={onSave}
          disabled={isLocked || saving || !isDirty}
          type="button"
        >
          {saving
            ? 'Saving...'
            : isDirty
            ? 'Save Changes *'
            : 'Save Timesheet'}
        </button>

        {!isLocked && weeklyTimesheet && weeklyTimesheet.status !== 'submitted' && (grandTotal > 0 || weeklyTimesheet.total_hours > 0) && (
          <button
            className={styles.navBtn}
            onClick={onSubmit}
            disabled={submitting || saving}
            type="button"
            title="Submit weekly timesheet to department manager for approval"
            style={{
              background: 'rgba(0, 229, 255, 0.15)',
              color: 'var(--vtr-theme-primary, #00e5ff)',
              border: '1px solid rgba(0, 229, 255, 0.4)',
              fontWeight: 700,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit to Manager ➔'}
          </button>
        )}

        {!isLocked && weeklyTimesheet?.status === 'submitted' && (
          <button
            className={styles.navBtn}
            onClick={onWithdraw}
            disabled={submitting}
            type="button"
            title="Withdraw submitted timesheet back to draft for edits"
            style={{
              background: 'rgba(255, 170, 0, 0.15)',
              color: '#ffb300',
              border: '1px solid rgba(255, 170, 0, 0.4)',
            }}
          >
            Withdraw for Edits
          </button>
        )}
      </div>
    </div>
  );
});
