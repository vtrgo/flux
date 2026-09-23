import React, { useCallback } from 'react';
import { IssueCard } from './IssueCard';
import { Defect } from '../types';

export interface IssueCardItemProps {
  issue: Defect;
  onCardClick: (issue: Defect) => void;
  onStatusChange: (e: React.MouseEvent, issue: Defect, newStatus: string) => void;
  onDelete: (e: React.MouseEvent, issueId: string) => void;
  cardStyle?: React.CSSProperties;
}

export const IssueCardItem = React.memo(function IssueCardItem({
  issue,
  onCardClick,
  onStatusChange,
  onDelete,
  cardStyle,
}: IssueCardItemProps) {
  const handleClick = useCallback(() => {
    onCardClick(issue);
  }, [onCardClick, issue]);

  const handleMarkFixed = useCallback((e: React.MouseEvent) => {
    onStatusChange(e, issue, 'fixed');
  }, [onStatusChange, issue]);

  const handleSignOff = useCallback((e: React.MouseEvent) => {
    onStatusChange(e, issue, 'verified');
  }, [onStatusChange, issue]);

  const handleReject = useCallback((e: React.MouseEvent) => {
    onStatusChange(e, issue, 'open');
  }, [onStatusChange, issue]);

  const handleReopen = useCallback((e: React.MouseEvent) => {
    onStatusChange(e, issue, 'open');
  }, [onStatusChange, issue]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    onDelete(e, issue.id);
  }, [onDelete, issue.id]);

  let actions: React.ReactNode = null;
  if (issue.status === 'open') {
    actions = (
      <>
        <button
          className="vtr-btn"
          style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleMarkFixed}
        >
          MARK FIXED
        </button>
        <button
          className="vtr-btn"
          style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleDeleteClick}
        >
          🗑️
        </button>
      </>
    );
  } else if (issue.status === 'fixed') {
    actions = (
      <>
        <button
          className="vtr-btn"
          style={{ flex: 1, borderColor: 'var(--accent-green)', color: 'var(--accent-green)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleSignOff}
        >
          SIGN OFF
        </button>
        <button
          className="vtr-btn"
          style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleReject}
        >
          REJECT
        </button>
        <button
          className="vtr-btn"
          style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleDeleteClick}
        >
          🗑️
        </button>
      </>
    );
  } else if (issue.status === 'verified') {
    actions = (
      <>
        <button
          className="vtr-btn"
          style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleReopen}
        >
          RE-OPEN
        </button>
        <button
          className="vtr-btn"
          style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }}
          onClick={handleDeleteClick}
        >
          🗑️
        </button>
      </>
    );
  }

  const computedStyle: React.CSSProperties = {
    ...(issue.status === 'verified' ? { opacity: 0.6 } : issue.status === 'fixed' ? { borderColor: 'var(--accent-amber)' } : {}),
    ...cardStyle,
  };

  return (
    <IssueCard
      issue={issue}
      onClick={handleClick}
      cardStyle={computedStyle}
      actions={actions}
    />
  );
});
