"use client";

import { useEffect, useState } from 'react';
import { useSSE, useSSEConnectionStatus } from '../components/SSEProvider';
import { fetchApi } from '../lib/api';
import Link from 'next/link';
import styles from './page.module.css';

import { DefectModal } from '../components/DefectModal';
import { SalesOrder, Machine, DefectSummary } from "../types";

export default function Home() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defectSummaries, setDefectSummaries] = useState<DefectSummary[]>([]);
  const [selectedMachineDept, setSelectedMachineDept] = useState<{ machineId: string, dept: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const sseConnected = useSSEConnectionStatus();

  useEffect(() => {
    Promise.all([
      fetchApi('sales_orders'),
      fetchApi('machines'),
      fetchApi('defects/summary')
    ])
      .then(([ordData, macData, defData]) => {
        setOrders(ordData || []);
        setMachines(macData || []);
        setDefectSummaries(defData || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setLoading(false);
      });
  }, []);

  const refetchAll = async () => {
    Promise.all([
      fetchApi('sales_orders'),
      fetchApi('machines'),
      fetchApi('defects/summary')
    ]).then(([ordData, macData, defData]) => {
      setOrders(ordData || []);
      setMachines(macData || []);
      setDefectSummaries(defData || []);
    });
  };

  const refetchOrders = async () => {
    const res = await fetchApi<SalesOrder[]>('sales_orders');
    setOrders(res || []);
  };

  const refetchSummaries = async () => {
    const res = await fetchApi<DefectSummary[]>('defects/summary');
    setDefectSummaries(res || []);
  };

  useSSE('sales_order_created', refetchOrders);
  useSSE('sales_order_updated', refetchOrders);
  useSSE('sales_order_deleted', refetchAll);

  useSSE('machine_created', (newMachine: Machine) => {
    setMachines(prev => [newMachine, ...prev]);
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    setMachines(prev => prev.filter(m => m.id !== deleted.id));
    refetchSummaries();
  });

  // Since summaries are aggregated, just refetch them on any defect mutation
  useSSE('defect_added', refetchSummaries);
  useSSE('defect_updated', refetchSummaries);
  useSSE('defect_deleted', refetchSummaries);


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
                    orderMachines.map(machine => {

                      return (
                        <Link href={`/machine?id=${machine.id}`} key={machine.id} className={styles.card} style={{ 
                          textDecoration: 'none',
                          color: 'inherit',
                          display: 'block',
                          background: 'rgba(0,0,0,0.1)',
                          position: 'relative'
                        }}>
                          <button 
                            onClick={(e) => handleDeleteMachine(e, machine.id)}
                            style={{
                              position: 'absolute',
                              top: '1rem',
                              right: '1rem',
                              background: 'transparent',
                              border: '1px solid var(--accent-red)',
                              color: 'var(--accent-red)',
                              borderRadius: '4px',
                              padding: '0.25rem 0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              zIndex: 10
                            }}
                            title="Delete Machine"
                          >
                            🗑️
                          </button>
                          
                          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{machine.order_number}</h3>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{machine.model_type}</div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                            {[
                              { key: 'design', label: 'Design' },
                              { key: 'kitting', label: 'Kitting' },
                              { key: 'machine_shop', label: 'Machine Shop' },
                              { key: 'assembly', label: 'Assembly' },
                              { key: 'electrical_controls', label: 'Controls' },
                              { key: 'enclosures', label: 'Enclosures' }
                            ].map(dept => {
                              // Find summary for this department (handle electrical_controls alias if needed)
                              const summary = defectSummaries.find(s => 
                                s.machine_id === machine.id && 
                                (s.assigned_department === dept.key || (dept.key === 'electrical_controls' && s.assigned_department === 'controls'))
                              );
                              
                              const openCritical = summary?.open_critical || 0;
                              const openModerate = summary?.open_moderate || 0;
                              const openMinor = summary?.open_minor || 0;
                              
                              const pendingCritical = summary?.pending_critical || 0;
                              const pendingModerate = summary?.pending_moderate || 0;
                              const pendingMinor = summary?.pending_minor || 0;
                              
                              const closed = summary?.closed || 0;
                              
                              const totalOpenAndPending = openCritical + openModerate + openMinor + pendingCritical + pendingModerate + pendingMinor;
                              
                              // Determine border based on highest severity open or pending
                              let borderColor = 'var(--border-color)';
                              if (openCritical > 0 || pendingCritical > 0) {
                                borderColor = 'var(--accent-red)';
                              } else if (openModerate > 0 || pendingModerate > 0) {
                                borderColor = 'var(--accent-amber)';
                              } else if (openMinor > 0 || pendingMinor > 0) {
                                borderColor = 'var(--vtr-theme-primary)';
                              }

                              return (
                                <div key={dept.key} 
                                  style={{ 
                                    background: 'rgba(255,255,255,0.02)', 
                                    border: `1px solid ${borderColor}`,
                                    padding: '0.75rem', 
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedMachineDept({ machineId: machine.id, dept: dept.key });
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                >
                                  <div style={{ color: 'var(--vtr-theme-primary)', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                                    {dept.label} (Total Open: {totalOpenAndPending})
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: (openCritical > 0 || pendingCritical > 0) ? 'var(--accent-red)' : 'var(--vtr-theme-neutral)' }}>
                                      <span>• Critical:</span> <span>{openCritical + pendingCritical} ({pendingCritical} pending)</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: (openModerate > 0 || pendingModerate > 0) ? 'var(--accent-amber)' : 'var(--vtr-theme-neutral)' }}>
                                      <span>• Moderate:</span> <span>{openModerate + pendingModerate} ({pendingModerate} pending)</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: (openMinor > 0 || pendingMinor > 0) ? 'var(--vtr-theme-primary)' : 'var(--vtr-theme-neutral)' }}>
                                      <span>• Minor:</span> <span>{openMinor + pendingMinor} ({pendingMinor} pending)</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.25rem 0' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--vtr-theme-neutral)' }}>
                                      <span>• Closed:</span> <span>{closed}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Link>
                      );
                    })
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
