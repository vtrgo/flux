import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Machine, DefectSummary, MachineFATReadinessResponse } from '../types';
import { ACTIVE_DEPARTMENTS } from '../lib/departments';
import { Authorize } from './Authorize';
import { calculateDaysLate, formatFatDate } from '../lib/dateUtils';
import { useDateTime } from '../contexts/DateTimeContext';
import { useMachineFATReadiness } from '../hooks/useMachineFATReadiness';
import styles from './MachineCard.module.css';

interface MachineCardProps {
  machine: Machine;
  defectSummaries: DefectSummary[];
  onDelete: (e: React.MouseEvent, id: string) => void;
  onSelectDept: (machineId: string, dept: string) => void;
  initialReadiness?: MachineFATReadinessResponse;
}

const MachineCard = React.memo(({ machine, defectSummaries, onDelete, onSelectDept, initialReadiness }: MachineCardProps) => {
  const router = useRouter();
  const { timezone } = useDateTime();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { readiness: fetchedReadiness, loading: loadingReadiness } = useMachineFATReadiness(initialReadiness ? undefined : machine.id);
  const readiness = initialReadiness || fetchedReadiness;

  const machineSummaries = defectSummaries.filter(s => s.machine_id === machine.id);
  const machineDaysLate = calculateDaysLate(machine.fat_date, timezone);
  
  const totalOpen = machineSummaries.reduce((sum, s) => sum + (s.total_open || 0), 0);
  const totalPending = machineSummaries.reduce((sum, s) => sum + (s.total_pending || 0), 0);
  const totalClosed = machineSummaries.reduce((sum, s) => sum + (s.closed || 0), 0);

  return (
    <Link href={`/machine?id=${machine.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className={styles.card}>
        <Authorize roles={['admin', 'manager']}>
          <button 
            onClick={(e) => onDelete(e, machine.id)}
            className={styles.deleteBtn}
            title="Delete Machine"
          >
            🗑️
          </button>
        </Authorize>
        
        <h3 className={styles.orderNumber}>{machine.order_number}</h3>
        <div className={styles.modelType}>{machine.model_type}</div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {machine.lead && <span>Lead: <strong style={{ color: 'var(--text-primary)' }}>{machine.lead}</strong></span>}
          {machine.lead && <span>•</span>}
          <span>F.A.T.: <strong style={{ color: 'var(--text-primary)' }}>{formatFatDate(machine.fat_date, 'TBD', timezone)}</strong></span>
          <span>•</span>
          <span>Days Late: <strong style={{ color: machineDaysLate > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-primary)' }}>{machineDaysLate}</strong></span>
        </div>
        
        {machine.created_by_user_name && (
          <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.2rem' }}>
            Created by: {machine.created_by_user_name}
          </div>
        )}

        {/* FAT Readiness Shield & Blocker Breakdown Popover */}
        <div className={styles.fatReadinessSection}>
          <button
            type="button"
            className={`${styles.fatShieldBtn} ${
              loadingReadiness && !readiness
                ? styles.fatShieldLoading
                : readiness?.can_proceed
                ? styles.fatShieldReady
                : styles.fatShieldBlocked
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPopoverOpen(prev => !prev);
            }}
            aria-label="FAT Readiness Status"
            aria-expanded={isPopoverOpen}
          >
            <span className={styles.shieldIcon}>
              {loadingReadiness && !readiness ? '⏳' : readiness?.can_proceed ? '🛡️' : '⚠️'}
            </span>
            <span className={styles.shieldStatusText}>
              {loadingReadiness && !readiness
                ? 'Assessing FAT Readiness...'
                : readiness?.can_proceed
                ? 'FAT READY • ALL SOP GATES PASSED'
                : `FAT BLOCKED • ${(readiness?.blockers || []).length} QUALITY BLOCKER${(readiness?.blockers || []).length === 1 ? '' : 'S'}`}
            </span>
            <span className={styles.shieldDetailsLink}>
              {isPopoverOpen ? 'Hide Blockers ▲' : 'Inspect Blockers ▼'}
            </span>
          </button>

          {isPopoverOpen && readiness && (
            <div
              className={styles.fatPopover}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className={styles.popoverHeader}>
                <div className={styles.popoverTitleRow}>
                  <span className={styles.popoverTitle}>FAT Readiness: {machine.order_number}</span>
                  <button
                    type="button"
                    className={styles.popoverCloseBtn}
                    onClick={() => setIsPopoverOpen(false)}
                    aria-label="Close Popover"
                  >
                    ✕
                  </button>
                </div>
                <div
                  className={
                    readiness.can_proceed
                      ? styles.popoverStatusReady
                      : styles.popoverStatusBlocked
                  }
                >
                  {readiness.can_proceed ? (
                    <span>✅ Cleared for Factory Acceptance Testing</span>
                  ) : (
                    <span>⛔ Blocked by Quality & Rework SOP Controls</span>
                  )}
                </div>
              </div>

              <div className={styles.statPills}>
                <div className={`${styles.statPill} ${readiness.open_issues > 0 ? styles.statPillAlert : ''}`}>
                  <span className={styles.statPillLabel}>Unverified Issues:</span>
                  <span className={styles.statPillValue}>{readiness.open_issues}</span>
                </div>
                <div className={`${styles.statPill} ${readiness.open_ncrs > 0 ? styles.statPillAlert : ''}`}>
                  <span className={styles.statPillLabel}>Active NCRs:</span>
                  <span className={styles.statPillValue}>{readiness.open_ncrs}</span>
                </div>
                <div className={`${styles.statPill} ${readiness.active_rework > 0 ? styles.statPillAlert : ''}`}>
                  <span className={styles.statPillLabel}>Active Rework:</span>
                  <span className={styles.statPillValue}>{readiness.active_rework}</span>
                </div>
              </div>

              {readiness.can_proceed ? (
                <div className={styles.popoverReadyMessage}>
                  All quality inspections, Non-Conformance Reports, and shop floor rework travelers are 100% resolved and verified.
                </div>
              ) : (
                <div className={styles.popoverBlockers}>
                  <div className={styles.blockersHeader}>Pre-FAT Quality Blockers:</div>
                  <ul className={styles.blockerList}>
                    {readiness.blockers.map((blocker, idx) => (
                      <li key={idx} className={styles.blockerItem}>
                        <span className={styles.blockerIcon}>🛑</span>
                        <span className={styles.blockerText}>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.popoverFooter}>
                {readiness.active_rework > 0 && (
                  <button
                    type="button"
                    className={styles.popoverActionLink}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push('/rework');
                    }}
                  >
                    Open Rework Orders &rarr;
                  </button>
                )}
                {readiness.open_ncrs > 0 && (
                  <button
                    type="button"
                    className={styles.popoverActionLink}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push('/ncrs');
                    }}
                  >
                    Review Active NCRs &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className={styles.summaryBadge}>
          <span style={{ color: totalOpen > 0 ? 'var(--accent-red)' : 'inherit' }}>Open: {totalOpen}</span>
          <span style={{ color: totalPending > 0 ? 'var(--accent-amber)' : 'inherit' }}>Pending: {totalPending}</span>
          <span>&rarr;</span>
          <span style={{ color: totalClosed > 0 ? 'var(--vtr-theme-primary)' : 'inherit' }}>Closed: {totalClosed}</span>
        </div>
        
        <div className={styles.departmentGrid}>
          {ACTIVE_DEPARTMENTS.map(dept => {
            const summary = machineSummaries.find(s => 
              s.assigned_department === dept.key || (dept.key === 'electrical_controls' && s.assigned_department === 'controls')
            );
            
            const openCritical = summary?.open_critical || 0;
            const openModerate = summary?.open_moderate || 0;
            const openMinor = summary?.open_minor || 0;
            
            const pendingCritical = summary?.pending_critical || 0;
            const pendingModerate = summary?.pending_moderate || 0;
            const pendingMinor = summary?.pending_minor || 0;
            
            const closed = summary?.closed || 0;
            const totalOpenAndPending = (summary?.total_open || 0) + (summary?.total_pending || 0);
            
            let cardClass = styles.deptCard;
            if (openCritical > 0 || pendingCritical > 0) {
              cardClass += ` ${styles.deptCardCritical}`;
            } else if (openModerate > 0 || pendingModerate > 0) {
              cardClass += ` ${styles.deptCardModerate}`;
            } else if (openMinor > 0 || pendingMinor > 0) {
              cardClass += ` ${styles.deptCardMinor}`;
            }

            return (
              <div key={dept.key} 
                className={cardClass}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectDept(machine.id, dept.key);
                }}
              >
                <div className={styles.deptTitle}>
                  {dept.label} {totalOpenAndPending > 0 && `(${totalOpenAndPending} Issues)`}
                </div>
                <div className={styles.deptStats}>
                  {totalOpenAndPending === 0 ? (
                    <div className={styles.noIssues}>✓ No active issues</div>
                  ) : (
                    <>
                      {(openCritical > 0 || pendingCritical > 0) && (
                        <div className={styles.statRow}>
                          <span className={styles.statCritical}>Critical:</span> 
                          <span className={styles.statCritical}>{openCritical > 0 ? `${openCritical} Open` : ''}{openCritical > 0 && pendingCritical > 0 ? ' | ' : ''}{pendingCritical > 0 ? `${pendingCritical} Pending` : ''}</span>
                        </div>
                      )}
                      {(openModerate > 0 || pendingModerate > 0) && (
                        <div className={styles.statRow}>
                          <span className={styles.statModerate}>Moderate:</span> 
                          <span className={styles.statModerate}>{openModerate > 0 ? `${openModerate} Open` : ''}{openModerate > 0 && pendingModerate > 0 ? ' | ' : ''}{pendingModerate > 0 ? `${pendingModerate} Pending` : ''}</span>
                        </div>
                      )}
                      {(openMinor > 0 || pendingMinor > 0) && (
                        <div className={styles.statRow}>
                          <span className={styles.statMinor}>Minor:</span> 
                          <span className={styles.statMinor}>{openMinor > 0 ? `${openMinor} Open` : ''}{openMinor > 0 && pendingMinor > 0 ? ' | ' : ''}{pendingMinor > 0 ? `${pendingMinor} Pending` : ''}</span>
                        </div>
                      )}
                    </>
                  )}
                  {closed > 0 && (
                    <>
                      <div className={styles.divider}></div>
                      <div className={styles.statRow}>
                        <span className={styles.statClosed}>Closed:</span> <span className={styles.statClosed}>{closed}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
});

MachineCard.displayName = "MachineCard";

export { MachineCard };
