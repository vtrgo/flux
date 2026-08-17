import React from 'react';
import styles from './IssueCard.module.css';
import { Defect } from '../types';

interface IssueCardProps {
  issue: Defect;
  onClick: () => void;
  cardStyle?: React.CSSProperties;
  actions: React.ReactNode;
}

export function IssueCard({ issue, onClick, cardStyle, actions }: IssueCardProps) {
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
        <span className={`${styles.severity} ${styles[issue.severity] || ''}`}>{issue.status}</span>
      </div>
      <h3 className={styles.source}>Source: {issue.source_department}</h3>
      <p className={styles.description}>{issue.description}</p>
      {issue.notes && (
        <div className={styles.note}>
          <strong className={styles.noteLabel}>Note:</strong> {issue.notes}
        </div>
      )}
      <div className={styles.actions}>
        {actions}
      </div>
    </div>
  );
}
