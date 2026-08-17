import React from 'react';
import Link from 'next/link';
import { Machine, DefectSummary } from '../types';
import { ACTIVE_DEPARTMENTS } from '../lib/departments';
import styles from './MachineCard.module.css';

interface MachineCardProps {
  machine: Machine;
  defectSummaries: DefectSummary[];
  onDelete: (e: React.MouseEvent, id: string) => void;
  onSelectDept: (machineId: string, dept: string) => void;
}

const MachineCard = React.memo(({ machine, defectSummaries, onDelete, onSelectDept }: MachineCardProps) => {
  const machineSummaries = defectSummaries.filter(s => s.machine_id === machine.id);
  
  const totalOpen = machineSummaries.reduce((sum, s) => sum + (s.total_open || 0), 0);
  const totalPending = machineSummaries.reduce((sum, s) => sum + (s.total_pending || 0), 0);
  const totalClosed = machineSummaries.reduce((sum, s) => sum + (s.closed || 0), 0);

  return (
    <Link href={`/machine?id=${machine.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className={styles.card}>
        <button 
          onClick={(e) => onDelete(e, machine.id)}
          className={styles.deleteBtn}
          title="Delete Machine"
        >
          🗑️
        </button>
        
        <h3 className={styles.orderNumber}>{machine.order_number}</h3>
        <div className={styles.modelType}>{machine.model_type}</div>
        
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
