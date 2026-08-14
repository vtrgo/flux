"use client";

import { useState } from 'react';
import { useSSEConnectionStatus } from '../components/SSEProvider';
import { fetchApi } from '../lib/api';
import { useDashboardData } from '../hooks/useDashboardData';
import Link from 'next/link';
import styles from './page.module.css';

import { DefectModal } from '../components/DefectModal';
import { MachineCard } from '../components/MachineCard';
import { SalesOrder, Machine, DefectSummary } from "../types";
import { ACTIVE_DEPARTMENTS } from '../lib/departments';

export default function Home() {
  const { orders, machines, defectSummaries, loading } = useDashboardData();
  const [selectedMachineDept, setSelectedMachineDept] = useState<{ machineId: string, dept: string } | null>(null);
  const sseConnected = useSSEConnectionStatus();


  const handleDeleteMachine = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("Are you sure you want to permanently delete this project? All associated tasks, parts, and issues will be lost.")) {
      try {
        await fetchApi(`machines/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error("Failed to delete machine:", err);
      }
    }
  };

  return (
    <main className={styles.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Active Pipeline</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/kickoff" className="vtr-btn">Project Initialization</Link>
          <div className={`${styles.statusBadge} ${sseConnected ? styles.online : styles.offline}`}>
            <span className={styles.indicator}></span>
            {sseConnected ? "SYSTEM ONLINE" : "CONNECTING..."}
          </div>
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

            return (
              <div key={order.id} className={styles.projectCard} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
                {/* Project Header */}
                <div style={{ 
                  padding: '1.5rem', 
                  borderBottom: '1px solid var(--vtr-card-border, var(--border-color))',
                  background: 'rgba(255,255,255,0.02)'
                }}>
                  <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--vtr-theme-primary)', fontSize: '1.5rem' }}>
                    {order.customer_name} {order.project_name ? `- ${order.project_name}` : ''}
                  </h2>
                  <div style={{ margin: 0, color: 'var(--vtr-theme-neutral, var(--text-secondary))', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', display: 'flex', gap: '1.5rem' }}>
                    <span>PO: {order.po_number}</span>
                    {order.internal_project_number && <span>Project #: {order.internal_project_number}</span>}
                    {order.responsible_person && <span>PM: {order.responsible_person}</span>}
                    <span>Status: {order.status}</span>
                  </div>
                </div>

                {/* Machines List */}
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {orderMachines.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>No machines spawned for this project yet.</div>
                  ) : (
                    orderMachines.map(machine => (
                      <MachineCard
                        key={machine.id}
                        machine={machine}
                        defectSummaries={defectSummaries}
                        onDelete={handleDeleteMachine}
                        onSelectDept={(machineId, dept) => setSelectedMachineDept({ machineId, dept })}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {selectedMachineDept && (
        <DefectModal
          machineId={selectedMachineDept.machineId}
          department={selectedMachineDept.dept}
          onClose={() => setSelectedMachineDept(null)}
        />
      )}
    </main>
  );
}
