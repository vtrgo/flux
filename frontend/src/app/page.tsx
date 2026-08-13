"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

interface Machine {
  id: string;
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
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newModelType, setNewModelType] = useState("");
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8080/api/machines').then(res => res.json()),
      fetch('http://localhost:8080/api/defects').then(res => res.json())
    ])
      .then(([macData, defData]) => {
        setMachines(macData || []);
        setDefects(defData || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setLoading(false);
      });

    const eventSource = new EventSource('http://localhost:8080/api/sse');

    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);

    eventSource.addEventListener('machine_created', (e) => {
      const newMachine: Machine = JSON.parse(e.data);
      setMachines(prev => [newMachine, ...prev]);
    });

    eventSource.addEventListener('defect_added', (e) => {
      const newDefect = JSON.parse(e.data);
      setDefects(prev => [...prev, newDefect]);
    });

    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      setDefects(prev => {
        const exists = prev.find(d => d.id === updated.id);
        if (exists) return prev.map(d => d.id === updated.id ? { ...updated, order_number: d.order_number } : d);
        return [...prev, updated];
      });
    });

    eventSource.addEventListener('defect_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setDefects(prev => prev.filter(d => d.id !== deleted.id));
    });

    eventSource.addEventListener('machine_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setMachines(prev => prev.filter(m => m.id !== deleted.id));
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleCreateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderNumber.trim() || !newModelType.trim()) return;

    try {
      await fetch('http://localhost:8080/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          order_number: newOrderNumber,
          model_type: newModelType 
        })
      });
      setNewOrderNumber("");
      setNewModelType("");
    } catch (err) {
      console.error("Failed to create machine:", err);
    }
  };

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <div className={`${styles.statusBadge} ${sseConnected ? styles.online : styles.offline}`}>
          <span className={styles.indicator}></span>
          {sseConnected ? "SYSTEM ONLINE" : "CONNECTING..."}
        </div>
      </div>
      <section className={styles.controls}>
        <form onSubmit={handleCreateMachine} className={styles.createForm}>
          <input 
            type="text" 
            placeholder="Order Number (e.g. ORD-1024)" 
            value={newOrderNumber}
            onChange={(e) => setNewOrderNumber(e.target.value)}
            className="vtr-input"
          />
          <select 
            value={newModelType} 
            onChange={(e) => setNewModelType(e.target.value)}
            className="vtr-input"
          >
            <option value="" disabled>Select Model Type...</option>
            <option value="VibroBowl 500">VibroBowl 500</option>
            <option value="Linear Feeder X1">Linear Feeder X1</option>
            <option value="Centrifugal Core">Centrifugal Core</option>
          </select>
          <button type="submit" className="vtr-btn" style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }}>INITIATE BUILD</button>
        </form>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
        {loading ? (
          <div className={styles.loading}>Syncing relational data...</div>
        ) : machines.length === 0 ? (
          <div className={styles.empty}>No active machines in production.</div>
        ) : (
          machines.map(machine => {
            const machineDefects = defects.filter(d => d.machine_id === machine.id);
            const openDefects = machineDefects.filter(d => d.status === 'open');
            const fixedDefects = machineDefects.filter(d => d.status === 'fixed');

            return (
              <Link href={`/machine/${machine.id}`} key={machine.id} className={styles.card} style={{ 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
                color: 'inherit',
                position: 'relative'
              }}>
                {/* Delete Button */}
                <button 
                  onClick={(e) => handleDeleteMachine(e, machine.id)}
                  style={{
                    position: 'absolute',
                    top: '1.2rem',
                    right: '1.5rem',
                    background: 'transparent',
                    border: '1px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    zIndex: 10
                  }}
                  title="Delete Project"
                >
                  🗑️
                </button>

                {/* Project Header */}
                <div style={{ 
                  padding: '1.5rem', 
                  borderBottom: '1px solid var(--vtr-card-border, var(--border-color))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  paddingRight: '5rem' // make room for the absolute delete button
                }}>
                  <div>
                    <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--vtr-theme-primary)', fontSize: '1.5rem' }}>{machine.order_number}</h2>
                    <p style={{ margin: 0, color: 'var(--vtr-theme-neutral, var(--text-secondary))', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                      {machine.model_type}
                    </p>
                  </div>
                </div>
                
                {/* Defect List */}
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--vtr-theme-primary, var(--text-primary))', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Department Deficiency Status
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    {[
                      { key: 'design', label: 'Design' },
                      { key: 'machine_shop', label: 'Machine Shop' },
                      { key: 'kitting', label: 'Kitting' },
                      { key: 'assembly', label: 'Assembly' },
                      { key: 'enclosures', label: 'Enclosures' },
                      { key: 'electrical_controls', label: 'Electrical / Controls', match: (d: any) => d.assigned_department === 'electrical_controls' || d.assigned_department === 'controls' }
                    ].map(dept => {
                      const deptDefects = machineDefects.filter(d => dept.match ? dept.match(d) : d.assigned_department === dept.key);
                      const open = deptDefects.filter(d => d.status === 'open').length;
                      const pending = deptDefects.filter(d => d.status === 'fixed').length;
                      const closed = deptDefects.filter(d => d.status === 'verified').length;
                      
                      return (
                        <div key={dept.key} style={{ 
                          background: 'rgba(255,255,255,0.03)', 
                          border: '1px solid var(--vtr-card-border, var(--border-color))',
                          padding: '1rem', 
                          borderRadius: '6px'
                        }}>
                          <div style={{ color: 'var(--vtr-theme-primary)', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.875rem' }}>{dept.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: open > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-neutral)' }}>
                              <span>Open:</span> <span>{open}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: pending > 0 ? 'var(--accent-amber)' : 'var(--vtr-theme-neutral)' }}>
                              <span>Pending:</span> <span>{pending}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: closed > 0 ? 'var(--accent-green)' : 'var(--vtr-theme-neutral)' }}>
                              <span>Closed:</span> <span>{closed}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
