"use client";

import { useEffect, useState } from 'react';
import { useSSE, useSSEConnectionStatus } from '../components/SSEProvider';
import Link from 'next/link';
import styles from './page.module.css';

interface SalesOrder {
  id: string;
  customer_name: string;
  po_number: string;
  internal_project_number?: string;
  project_name?: string;
  responsible_person?: string;
  status: string;
}

interface Machine {
  id: string;
  sales_order_id: string;
  order_number: string;
  model_type: string;
  status: string;
  created_at: string;
}

interface Defect {
  id: string;
  machine_id: string;
  order_number: string;
  source_department: string;
  assigned_department: string;
  description: string;
  severity: string;
  status: string;
  notes?: string;
}

export default function Home() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const sseConnected = useSSEConnectionStatus();

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8080/api/sales_orders').then(res => res.json()),
      fetch('http://localhost:8080/api/machines').then(res => res.json()),
      fetch('http://localhost:8080/api/defects').then(res => res.json())
    ])
      .then(([ordData, macData, defData]) => {
        setOrders(ordData || []);
        setMachines(macData || []);
        setDefects(defData || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setLoading(false);
      });
  }, []);

  const refetchAll = async () => {
    Promise.all([
      fetch('http://localhost:8080/api/sales_orders').then(res => res.json()),
      fetch('http://localhost:8080/api/machines').then(res => res.json()),
      fetch('http://localhost:8080/api/defects').then(res => res.json())
    ]).then(([ordData, macData, defData]) => {
      setOrders(ordData || []);
      setMachines(macData || []);
      setDefects(defData || []);
    });
  };

  const refetchOrders = async () => {
    const res = await fetch('http://localhost:8080/api/sales_orders');
    setOrders(await res.json() || []);
  };

  useSSE('sales_order_created', refetchOrders);
  useSSE('sales_order_updated', refetchOrders);
  useSSE('sales_order_deleted', refetchAll);

  useSSE('machine_created', (newMachine: Machine) => {
    setMachines(prev => [newMachine, ...prev]);
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    setMachines(prev => prev.filter(m => m.id !== deleted.id));
  });

  useSSE('defect_added', (newDefect: Defect) => {
    setDefects(prev => [...prev, newDefect]);
  });

  useSSE('defect_updated', (updated: Defect) => {
    setDefects(prev => {
      const exists = prev.find(d => d.id === updated.id);
      if (exists) return prev.map(d => d.id === updated.id ? { ...updated, order_number: d.order_number } : d);
      return [...prev, updated];
    });
  });

  useSSE('defect_deleted', (deleted: { id: string }) => {
    setDefects(prev => prev.filter(d => d.id !== deleted.id));
  });


  const handleDeleteMachine = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("Are you sure you want to permanently delete this project? All associated tasks, parts, and issues will be lost.")) {
      try {
        await fetch(`http://localhost:8080/api/machines/${id}`, { method: 'DELETE' });
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
                      const machineDefects = defects.filter(d => d.machine_id === machine.id);
                      return (
                        <Link href={`/machine/${machine.id}`} key={machine.id} className={styles.card} style={{ 
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
                              { key: 'machine_shop', label: 'Machine Shop' },
                              { key: 'kitting', label: 'Kitting' },
                              { key: 'assembly', label: 'Assembly' },
                              { key: 'enclosures', label: 'Enclosures' },
                              { key: 'electrical_controls', label: 'Controls', match: (d: any) => d.assigned_department === 'electrical_controls' || d.assigned_department === 'controls' }
                            ].map(dept => {
                              const deptDefects = machineDefects.filter(d => dept.match ? dept.match(d) : d.assigned_department === dept.key);
                              const open = deptDefects.filter(d => d.status === 'open').length;
                              const pending = deptDefects.filter(d => d.status === 'fixed').length;
                              const closed = deptDefects.filter(d => d.status === 'verified').length;
                              
                              return (
                                <div key={dept.key} style={{ 
                                  background: 'rgba(255,255,255,0.02)', 
                                  border: '1px solid var(--border-color)',
                                  padding: '0.75rem', 
                                  borderRadius: '6px'
                                }}>
                                  <div style={{ color: 'var(--vtr-theme-primary)', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.8rem' }}>{dept.label}</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: open > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-neutral)' }}>
                                      <span>Open:</span> <span>{open}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: pending > 0 ? 'var(--accent-amber)' : 'var(--vtr-theme-neutral)' }}>
                                      <span>Pending:</span> <span>{pending}</span>
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
    </main>
  );
}
