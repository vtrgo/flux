import React from 'react';
import { SalesOrder, Machine, DefectSummary } from '../types';
import { MachineCard } from './MachineCard';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  order: SalesOrder;
  orderMachines: Machine[];
  projectSummary: any; // Type may need adjustments depending on actual usage in Dashboard
  defectSummaries: DefectSummary[];
  onDeleteMachine: (e: React.MouseEvent, id: string) => void;
  onSelectDept: (machineId: string, dept: string) => void;
}

export function ProjectCard({
  order,
  orderMachines,
  projectSummary,
  defectSummaries,
  onDeleteMachine,
  onSelectDept
}: ProjectCardProps) {
  const projectTotalOpen = projectSummary?.total_open || 0;
  const projectTotalPending = projectSummary?.total_pending || 0;
  const projectTotalClosed = projectSummary?.total_closed || 0;

  return (
    <div className={styles.card}>
      {/* Project Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {order.customer_name} {order.project_name ? `- ${order.project_name}` : ''}
          </h2>
          <div className={styles.meta}>
            <span>PO: {order.po_number}</span>
            {order.internal_project_number && <span>Project #: {order.internal_project_number}</span>}
            {order.responsible_person && <span>PM: {order.responsible_person}</span>}
            <span>Status: {order.status}</span>
          </div>
        </div>
        
        {/* Project Summary Counts */}
        <div className={styles.summaryContainer}>
          <div className={styles.summaryBadge}>
            <span className={projectTotalOpen > 0 ? styles.statOpen : styles.statDefault}>
              Project Open: {projectTotalOpen}
            </span>
            <span className={projectTotalPending > 0 ? styles.statPending : styles.statDefault}>
              Project Pending: {projectTotalPending}
            </span>
            <span>&rarr;</span>
            <span className={projectTotalClosed > 0 ? styles.statClosed : styles.statDefault}>
              Project Closed: {projectTotalClosed}
            </span>
          </div>
        </div>
      </div>

      {/* Machines List */}
      <div className={styles.machinesList}>
        {orderMachines.length === 0 ? (
          <div className={styles.emptyState}>No machines spawned for this project yet.</div>
        ) : (
          orderMachines.map(machine => (
            <MachineCard
              key={machine.id}
              machine={machine}
              defectSummaries={defectSummaries}
              onDelete={onDeleteMachine}
              onSelectDept={onSelectDept}
            />
          ))
        )}
      </div>
    </div>
  );
}
