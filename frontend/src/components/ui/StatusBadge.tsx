import React from 'react';
import styles from './StatusBadge.module.css';

export type StatusVariant = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

interface StatusBadgeProps {
  status?: string;
  severity?: 'critical' | 'moderate' | 'minor' | string;
  variant?: StatusVariant;
  size?: 'sm' | 'md';
  showDot?: boolean;
  label?: string;
  className?: string;
  icon?: React.ReactNode;
}

const SEVERITY_MAP: Record<string, StatusVariant> = {
  critical: 'danger',
  moderate: 'warning',
  minor: 'info',
};

const STATUS_MAP: Record<string, StatusVariant> = {
  open: 'danger',
  active: 'warning',
  in_progress: 'warning',
  in_mfg: 'warning',
  outside_pp: 'info',
  fixed: 'warning',
  verified: 'success',
  complete: 'success',
  completed: 'success',
  closed: 'neutral',
  archived: 'neutral',
};

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(function StatusBadge({
  status,
  severity,
  variant,
  size = 'md',
  showDot = false,
  label,
  className = '',
  icon,
}) {
  let resolvedVariant: StatusVariant = variant || 'neutral';

  if (!variant) {
    if (severity && SEVERITY_MAP[severity.toLowerCase()]) {
      resolvedVariant = SEVERITY_MAP[severity.toLowerCase()];
    } else if (status && STATUS_MAP[status.toLowerCase()]) {
      resolvedVariant = STATUS_MAP[status.toLowerCase()];
    }
  }

  const displayLabel = label || severity || status || '';

  return (
    <span
      className={`${styles.badge} ${styles[resolvedVariant]} ${styles[size]} ${className}`}
      data-testid="status-badge"
    >
      {showDot && <span className={styles.dot} aria-hidden="true" />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{displayLabel.replace(/_/g, ' ')}</span>
    </span>
  );
});
