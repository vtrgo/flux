"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./machine.module.css";

import { IssueModal } from "../../../components/IssueModal";

interface Machine {
  id: string;
  sales_order_id?: string;
  order_number: string;
  model_type: string;
}

interface SalesOrder {
  id: string;
  customer_name: string;
  po_number: string;
  internal_project_number?: string;
  project_name?: string;
  responsible_person?: string;
  target_ship_date: string;
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

export default function MachineDetail() {
  const params = useParams();
  const id = params.id as string;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [macRes, defRes] = await Promise.all([
          fetch(`http://localhost:8080/api/machines`), 
          fetch(`http://localhost:8080/api/machines/${id}/defects`)
        ]);

        const machines: Machine[] = await macRes.json();
        const found = machines.find(m => m.id === id);
        if (found) {
          setMachine(found);
          if (found.sales_order_id) {
            try {
              const salesRes = await fetch(`http://localhost:8080/api/sales_orders`);
              const orders: SalesOrder[] = await salesRes.json();
              const foundOrder = orders.find(o => o.id === found.sales_order_id);
              if (foundOrder) setSalesOrder(foundOrder);
            } catch (err) {
              console.error("Failed to load sales order data", err);
            }
          }
        }

        setDefects(await defRes.json() || []);
      } catch (err) {
        console.error("Failed to load machine data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('defect_added', (e) => {
      const newDefect = JSON.parse(e.data);
      if (newDefect.machine_id === id) {
        setDefects(prev => [...prev, newDefect]);
      }
    });

    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.machine_id === id) {
        setDefects(prev => prev.map(d => d.id === updated.id ? { ...updated, order_number: d.order_number } : d));
      }
    });

    eventSource.addEventListener('defect_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setDefects(prev => prev.filter(d => d.id !== deleted.id));
    });

    return () => {
      eventSource.close();
    };
  }, [id]);

  const openNewModal = () => {
    setEditingDefect(null);
    setIsModalOpen(true);
  };

  const openEditModal = (defect: Defect, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingDefect(defect);
    setIsModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, defectId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this issue?")) return;
    try {
      await fetch(`http://localhost:8080/api/defects/${defectId}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete defect", err);
    }
  };

  const handleStatusChange = async (e: React.MouseEvent, defect: Defect, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:8080/api/defects/${defect.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: nextStatus,
          assigned_department: defect.assigned_department
        })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (loading) return <div className={styles.loading}>ESTABLISHING CONNECTION...</div>;
  if (!machine) return <div className={styles.loading}>MACHINE NOT FOUND</div>;

  const openDefects = defects.filter(d => d.status === 'open');
  const fixedDefects = defects.filter(d => d.status === 'fixed');
  const verifiedDefects = defects.filter(d => d.status === 'verified');

  const deptOrder = [
    { key: 'design', label: 'Design' },
    { key: 'kitting', label: 'Kitting' },
    { key: 'machine_shop', label: 'Machine Shop' },
    { key: 'electrical_controls', label: 'Electrical', match: (d: Defect) => d.assigned_department === 'electrical_controls' || d.assigned_department === 'controls' },
    { key: 'assembly', label: 'Assembly' },
    { key: 'enclosures', label: 'Enclosures' },
    { key: 'other', label: 'Other', match: (d: Defect) => !['design', 'kitting', 'machine_shop', 'electrical_controls', 'controls', 'assembly', 'enclosures'].includes(d.assigned_department) }
  ];

  const renderGroupedDefects = (defectList: Defect[], renderActions: (defect: Defect) => React.ReactNode, getStyle?: (defect: Defect) => React.CSSProperties) => {
    if (defectList.length === 0) {
      return <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No issues.</p>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {deptOrder.map(dept => {
          const deptIssues = defectList.filter(d => dept.match ? dept.match(d) : d.assigned_department === dept.key);
          if (deptIssues.length === 0) return null;

          return (
            <div key={dept.key}>
              <h3 style={{ 
                margin: '0 0 1rem 0', 
                fontSize: '0.875rem', 
                color: 'var(--text-secondary)', 
                borderBottom: '1px solid var(--border-color)', 
                paddingBottom: '0.5rem',
                textTransform: 'uppercase',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                {dept.label}
                <span>{deptIssues.length}</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {deptIssues.map(defect => (
                  <div key={defect.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', cursor: 'pointer', transition: 'all 0.2s ease', ...getStyle?.(defect) }} onClick={() => openEditModal(defect)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{defect.severity.toUpperCase()}</span>
                    </div>
                    <p style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.4' }}>{defect.description}</p>
                    {defect.notes && (
                      <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {defect.notes}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>Source: {defect.source_department}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {renderActions(defect)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className={styles.title}>{machine.order_number}</h1>
              <div className={styles.subtitle}>{machine.model_type} - Project Deficiency Portal</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
              <Link href="/" className="vtr-btn vtr-btn-secondary">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
          
          {salesOrder && (
            <div style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              padding: '1rem',
              display: 'flex',
              gap: '2rem',
              fontFamily: 'var(--font-mono)'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Customer</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.customer_name} {salesOrder.project_name ? `(${salesOrder.project_name})` : ''}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>PO Number</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.po_number}</div>
              </div>
              {salesOrder.internal_project_number && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Internal Project #</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.internal_project_number}</div>
                </div>
              )}
              {salesOrder.responsible_person && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>PM / Responsible</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.responsible_person}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Target Ship Date</div>
                <div style={{ fontSize: '0.875rem', color: salesOrder.target_ship_date ? 'var(--vtr-theme-primary)' : 'var(--text-secondary)' }}>
                  {salesOrder.target_ship_date ? new Date(salesOrder.target_ship_date).toLocaleDateString() : 'TBD'}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', width: '100%' }}>
        {/* OPEN COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Open Issues <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{openDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(openDefects, (defect) => (
              <>
                <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'fixed')}>MARK FIXED</button>
                <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
              </>
            ))}
          </div>
        </section>

        {/* FIXED COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Fixed (Pending Verification) <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{fixedDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(fixedDefects, (defect) => (
              <>
                <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-green)', color: 'var(--accent-green)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'verified')}>SIGN OFF</button>
                <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'open')}>REJECT</button>
                <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
              </>
            ), () => ({ border: '1px solid var(--accent-amber)' }))}
          </div>
        </section>

        {/* VERIFIED COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Verified & Cleared <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{verifiedDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(verifiedDefects, (defect) => (
              <>
                <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'open')}>RE-OPEN</button>
                <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
              </>
            ), () => ({ opacity: 0.6 }))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect} 
        defaultAssignedDept="quality"
      />
    </main>
  );
}
