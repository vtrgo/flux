"use client";

import React, { memo } from 'react';
import { WeeklyTimesheet } from '../../types';
import styles from '../WeeklyTimesheetGrid.module.css';

interface TimesheetStatusBannerProps {
  weeklyTimesheet: WeeklyTimesheet | null;
  readOnlyUserView: boolean;
}

export const TimesheetStatusBanner = memo(function TimesheetStatusBanner({
  weeklyTimesheet,
  readOnlyUserView,
}: TimesheetStatusBannerProps) {
  if (readOnlyUserView || !weeklyTimesheet) return null;

  if (weeklyTimesheet.status === 'approved') {
    return (
      <div className={`${styles.banner} ${styles.bannerApproved}`}>
        <span>
          ✅ <strong>Timesheet Approved</strong>
        </span>
      </div>
    );
  }

  if (weeklyTimesheet.status === 'rejected') {
    return (
      <div className={`${styles.banner} ${styles.bannerRejected}`}>
        <span>
          ❌ <strong>Rejection Notice:</strong>{' '}
          {weeklyTimesheet.rejection_reason || 'Please review your logged hours and re-submit.'}
        </span>
      </div>
    );
  }

  return null;
});
