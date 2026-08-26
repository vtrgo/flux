import React from 'react';
import styles from './IssueCard.module.css';
import { Defect } from '../types';
import { AttachmentViewer } from './AttachmentViewer';

interface IssueCardProps {
  issue: Defect;
  onClick: () => void;
  cardStyle?: React.CSSProperties;
  actions: React.ReactNode;
}

function formatTimestamp(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const IssueCard = React.memo(function IssueCard({ issue, onClick, cardStyle, actions }: IssueCardProps) {
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
        <span className={styles.orderNumber}>{issue.order_number}</span>
        <span className={`${styles.severity} ${styles[issue.severity] || ''}`}>{issue.severity}</span>
      </div>
      <h3 className={styles.source}>Source: {issue.source_department}</h3>
      <p className={styles.description}>{issue.description}</p>
      {issue.assigned_user_name && (
        <div className={styles.assignee}>
          <strong>Assigned to:</strong> {issue.assigned_user_name}
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
              <span className={styles.timestampValue}>{formatTimestamp(issue.created_at)}</span>
            </div>
          )}
          {issue.resolved_at && isClosed && (
            <div className={styles.timestampItem}>
              <span className={styles.timestampLabel}>{issue.status === 'verified' ? 'Verified' : 'Fixed'}{issue.verified_by_user_name ? ` by ${issue.verified_by_user_name}` : issue.fixed_by_user_name ? ` by ${issue.fixed_by_user_name}` : ''}:</span>
              <span className={styles.timestampValue}>{formatTimestamp(issue.resolved_at)}</span>
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
