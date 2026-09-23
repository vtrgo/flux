import React from 'react';
import styles from './IssueCard.module.css';
import { Defect } from '../types';
import { AttachmentViewer } from './AttachmentViewer';
import { useDateTime } from '../contexts/DateTimeContext';
import { formatTimestamp, formatFatDate } from '../lib/dateUtils';

interface IssueCardProps {
  issue: Defect;
  onClick: () => void;
  cardStyle?: React.CSSProperties;
  actions: React.ReactNode;
}

export const IssueCard = React.memo(function IssueCard({ issue, onClick, cardStyle, actions }: IssueCardProps) {
  const { timezone } = useDateTime();
  const isClosed = issue.status === 'fixed' || issue.status === 'verified';

  return (
    <div 
      className={styles.card} 
      style={cardStyle} 
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      <div className={styles.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className={styles.orderNumber}>{issue.order_number}</span>
          {issue.is_ncr && (
            <span className={styles.ncrBadge}>{issue.ncr_number || 'NCR'}</span>
          )}
        </div>
        <span className={`${styles.severity} ${styles[issue.severity] || ''}`}>{issue.severity}</span>
      </div>
      <h3 className={styles.source}>Source: {issue.source_department}</h3>
      {issue.location && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #aaa)', marginBottom: '0.35rem' }}>
          <strong>Location:</strong> {issue.location} {issue.assembler ? `• ${issue.assembler}` : ''}
        </div>
      )}
      <p className={styles.description}>{issue.description}</p>
      {issue.assigned_user_name && (
        <div className={styles.assignee}>
          <strong>Assigned to:</strong> {issue.assigned_user_name}
        </div>
      )}
      {issue.due_date && (
        <div className={styles.dueDate}>
          <span className={styles.dueDateLabel}>Target Resolution:</span>
          <span className={styles.dueDateValue}>{formatFatDate(issue.due_date, 'None', timezone)}</span>
        </div>
      )}
      {issue.notes && (
        <div className={styles.note}>
          <strong className={styles.noteLabel}>Note:</strong> {issue.notes}
        </div>
      )}
      <AttachmentViewer issueId={issue.id} />
      
      {(issue.created_at || (issue.resolved_at && isClosed)) && (
        <div className={styles.timestamps}>
          {issue.created_at && (
            <div className={styles.timestampItem}>
              <span className={styles.timestampLabel}>Opened{issue.created_by_user_name ? ` by ${issue.created_by_user_name}` : ''}:</span>
              <span className={styles.timestampValue}>{formatTimestamp(issue.created_at, timezone)}</span>
            </div>
          )}
          {issue.resolved_at && isClosed && (
            <div className={styles.timestampItem}>
              <span className={styles.timestampLabel}>{issue.status === 'verified' ? 'Verified' : 'Fixed'}{issue.verified_by_user_name ? ` by ${issue.verified_by_user_name}` : issue.fixed_by_user_name ? ` by ${issue.fixed_by_user_name}` : ''}:</span>
              <span className={styles.timestampValue}>{formatTimestamp(issue.resolved_at, timezone)}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        {actions}
      </div>
    </div>
  );
});
