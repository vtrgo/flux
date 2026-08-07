"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../quality/quality.module.css"; // Reuse the layout styles

import { IssueModal } from "../../components/IssueModal";

interface KittingPart {
  id: string;
  machine_id: string;
  order_number: string;
  department: string;
  part_number: string;
  description: string;
  qty_required: number;
  qty_picked: number;
  status: string;
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
}

export default function KittingHub() {
  const [parts, setParts] = useState<KittingPart[]>([]);
  const [issues, setIssues] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [partsRes, defectsRes] = await Promise.all([
          fetch(`http://localhost:8080/api/kitting`),
          fetch(`http://localhost:8080/api/defects`)
        ]);
        
        setParts(await partsRes.json() || []);
        
        const allDefects: Defect[] = await defectsRes.json() || [];
        setIssues(allDefects.filter(d => d.assigned_department === 'kitting' && d.status !== 'verified'));
      } catch (err) {
        console.error("Failed to load kitting data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('kitting_part_updated', (e) => {
      const updatedPart = JSON.parse(e.data);
      setParts(prev => prev.map(p => p.id === updatedPart.id ? { ...updatedPart, order_number: p.order_number } : p));
    });

    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.assigned_department === 'kitting' && updated.status !== 'verified') {
        setIssues(prev => {
          const exists = prev.find(f => f.id === updated.id);
          if (exists) return prev.map(f => f.id === updated.id ? { ...updated, order_number: f.order_number } : f);
          return [...prev, updated];
        });
      } else {
        setIssues(prev => prev.filter(f => f.id !== updated.id));
      }
    });

    eventSource.addEventListener('defect_added', () => fetchData());
    eventSource.addEventListener('defect_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setIssues(prev => prev.filter(d => d.id !== deleted.id));
    });

    return () => {
      eventSource.close();
    };
  }, []);

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

  const handleUpdateQty = async (part: KittingPart) => {
    if (part.status === 'fulfilled') {
      window.alert("This part is already fully picked.");
      return;
    }

    const input = window.prompt(`Update QTY PICKED for ${part.part_number}\nCurrently: ${part.qty_picked} / ${part.qty_required}`);
    if (input === null || input.trim() === "") return;
    
    const picked = parseInt(input.trim(), 10);
    if (isNaN(picked) || picked < 0) {
      window.alert("Please enter a valid positive number.");
      return;
    }

    try {
      await fetch(`http://localhost:8080/api/kitting/${part.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty_picked: picked })
      });
    } catch (err) {
      console.error("Failed to update part", err);
    }
  };

  const handleIssueUpdate = async (e: React.MouseEvent, issue: Defect, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:8080/api/defects/${issue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, assigned_department: issue.assigned_department })
      });
    } catch (err) {
      console.error("Failed to update issue", err);
    }
  };

  if (loading) return <div className={styles.loading}>LOADING KITTING BOM...</div>;

  const pendingParts = parts.filter(p => p.status !== 'fulfilled');
  const fulfilledParts = parts.filter(p => p.status === 'fulfilled');

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>Global Kitting Hub</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
          <Link href="/" className="vtr-btn vtr-btn-secondary">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className={styles.grid}>
        {/* ASSIGNED ISSUES COLUMN */}
        <section className={styles.column}>
          <h2>Assigned Issues <span className={styles.badge}>{issues.length}</span></h2>
          <div className={styles.list}>
            {issues.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No assigned issues.</p>
            ) : issues.map(issue => (
              <div key={issue.id} className={styles.card} onClick={() => openEditModal(issue)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{issue.order_number}</span>
                  <span className={`${styles.severity} ${styles[issue.severity]}`}>{issue.status}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {issue.source_department}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{issue.description}</p>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  {issue.status === 'open' && (
                    <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleIssueUpdate(e, issue, 'fixed')}>MARK FIXED</button>
                  )}
                  {issue.status === 'fixed' && (
                    <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleIssueUpdate(e, issue, 'open')}>RE-OPEN</button>
                  )}
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PENDING COLUMN */}
        <section className={styles.column}>
          <h2>Pending BOM <span className={styles.badge}>{pendingParts.length}</span></h2>
          <div className={styles.list}>
            {pendingParts.map(part => (
              <div key={part.id} className={styles.card} onClick={() => handleUpdateQty(part)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{part.order_number}</span>
                  <span className={styles.severity} style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }}>{part.status.toUpperCase()}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{part.part_number}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{part.description}</p>
                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>QTY: {part.qty_picked} / {part.qty_required}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FULFILLED COLUMN */}
        <section className={styles.column}>
          <h2>Fulfilled <span className={styles.badge}>{fulfilledParts.length}</span></h2>
          <div className={styles.list}>
            {fulfilledParts.map(part => (
              <div key={part.id} className={styles.card} style={{ opacity: 0.6, cursor: 'default' }}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{part.order_number}</span>
                  <span className={styles.severity} style={{ color: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}>FULFILLED</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{part.part_number}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{part.description}</p>
                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>QTY: {part.qty_picked} / {part.qty_required}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept="kitting"
      />
    </main>
  );
}
