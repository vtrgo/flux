"use client";

import { useState, useCallback } from 'react';

import { fetchApi } from '../../lib/api';
import { useDashboardData } from '../../hooks/useDashboardData';
import Link from 'next/link';
import styles from './page.module.css';

import { DefectModal } from '../../components/DefectModal';
import { MachineCard } from '../../components/MachineCard';
import { ProjectCard } from '../../components/ProjectCard';
import { SalesOrder, Machine, DefectSummary } from "../../types";
import { ACTIVE_DEPARTMENTS } from '../../lib/departments';

export default function Home() {
  const { orders, machines, defectSummaries, projectSummaries, loading } = useDashboardData();
  const [selectedMachineDept, setSelectedMachineDept] = useState<{ machineId: string, dept: string } | null>(null);


  const handleDeleteMachine = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("Are you sure you want to permanently delete this project? All associated tasks, parts, and issues will be lost.")) {
      try {
        await fetchApi(`machines/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error("Failed to delete machine:", err);
      }
    }
  }, []);

  const handleSelectDept = useCallback((machineId: string, dept: string) => {
    setSelectedMachineDept({ machineId, dept });
  }, []);

  return (
    <main className={styles.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Active Pipeline</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/kickoff" className="vtr-btn">Project Initialization</Link>
        </div>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
        {loading ? (
          <div className={styles.loading}>Syncing relational data...</div>
        ) : orders.length === 0 ? (
          <div className={styles.empty}>No active projects in production.</div>
        ) : (
          orders.map(order => {
            const orderMachines = machines.filter(m => m.sales_order_id === order.id);
            const projectSummary = projectSummaries.find(s => s.sales_order_id === order.id);

            const projectTotalOpen = projectSummary?.total_open || 0;
            const projectTotalPending = projectSummary?.total_pending || 0;
            const projectTotalClosed = projectSummary?.total_closed || 0;

            return (
              <ProjectCard
                key={order.id}
                order={order}
                orderMachines={orderMachines}
                projectSummary={projectSummary}
                defectSummaries={defectSummaries}
                onDeleteMachine={handleDeleteMachine}
                onSelectDept={handleSelectDept}
              />
            );
          })
        )}
      </section>

      {selectedMachineDept && (
        <DefectModal
          machineId={selectedMachineDept.machineId}
          department={selectedMachineDept.dept}
          machineName={
            (() => {
              const m = machines.find(m => m.id === selectedMachineDept.machineId);
              return m ? `${m.order_number} ${m.model_type}` : "";
            })()
          }
          onClose={() => setSelectedMachineDept(null)}
        />
      )}
    </main>
  );
}
