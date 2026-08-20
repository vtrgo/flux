import React from 'react';
import styles from './DisplayMachineRow.module.css';
import { Machine, DefectSummary } from '../types';

interface DisplayMachineRowProps {
  machine: Machine & { 
    departmentDefects: DefectSummary[];
    machine_totals?: { total_open: number; total_pending: number };
  };
  departments: string[];
}

export function DisplayMachineRow({ machine, departments }: DisplayMachineRowProps) {
  // Helper to get summary for a department
  const getSummary = (dept: string) => {
    return machine.departmentDefects?.find(d => d.assigned_department === dept);
  };

  const totalOpen = machine.machine_totals?.total_open || 0;
  const totalPending = machine.machine_totals?.total_pending || 0;

  return (
    <div className={styles.row}>
      <div className={styles.borderedArea}>
        <div className={styles.machineInfo}>
          <h3 className={styles.machineName}>{machine.order_number}</h3>
          <div className={styles.machineModel}>{machine.model_type}</div>
        </div>

        {departments.map(dept => {
          const summary = getSummary(dept);
          const open = summary?.total_open || 0;
          const pending = summary?.total_pending || 0;
          const openCritical = summary?.open_critical || 0;

          return (
            <div key={dept} className={styles.cell}>
              {open > 0 && (
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                  <span className={`${styles.badge} ${styles.badgeOpen}`}>{open}</span>
                  {openCritical > 0 && (
                    <span className={styles.criticalTag}>CRITICAL</span>
                  )}
                </div>
              )}
              {pending > 0 && <span className={`${styles.badge} ${styles.badgePending}`}>{pending}</span>}
              {open === 0 && pending === 0 && <span className={`${styles.badge} ${styles.badgeZero}`}>0</span>}
            </div>
          );
        })}
      </div>
      
      {/* Machine Totals Cell */}
      <div className={styles.cell} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
        {totalOpen > 0 && <span style={{ color: '#ef4444' }}>{totalOpen}</span>}
        {totalPending > 0 && <span style={{ color: '#eab308' }}>{totalPending}</span>}
        {totalOpen === 0 && totalPending === 0 && <span style={{ color: '#22c55e' }}>0</span>}
      </div>
    </div>
  );
}
