import React from 'react';
import styles from './DisplayMachineRow.module.css';
import { Machine, MachineDefectSummary } from '../types';

interface DisplayMachineRowProps {
  machine: Machine & { defects?: MachineDefectSummary };
}

export function DisplayMachineRow({ machine }: DisplayMachineRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.machineInfo}>
        <div className={styles.machineText}>
          <h3 className={styles.machineName}>{machine.order_number}</h3>
          <div className={styles.machineModel}>{machine.model_type}</div>
        </div>
        
        {/* Status Badge (Suppress Engineering) */}
        {machine.status !== 'engineering' && (
          <span className={styles.statusBadge}>
            {machine.status.replace('_', ' ')}
          </span>
        )}
        {machine.status === 'engineering' && <div className={styles.statusSpacer}></div>}
      </div>

      {/* Compact Horizontal Metrics */}
      <div className={styles.metricsContainer}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>OPEN:</span> 
          <span className={styles.metricOpen}>{machine.defects?.total_open || 0}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>PENDING:</span> 
          <span className={styles.metricPending}>{machine.defects?.total_pending || 0}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>CLOSED:</span> 
          <span className={styles.metricClosed}>{machine.defects?.total_closed || 0}</span>
        </div>
      </div>
    </div>
  );
}
