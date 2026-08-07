"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../quality/quality.module.css"; // Reuse the layout styles

import { IssueModal } from "../../components/IssueModal";

interface Defect {
  id: string;
  machine_id: string;
  order_number: string;
  source_department: string;
  assigned_department: string;
  description: string;
  severity: string;
  status: string; // open, fixed, verified
}

export default function DesignHub() {
  const [feedbackList, setFeedbackList] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:8080/api/defects`);
        const allDefects: Defect[] = await res.json() || [];
        setFeedbackList(allDefects.filter(d => d.assigned_department === 'design'));
      } catch (err) {
        console.error("Failed to load design feedback", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.assigned_department === 'design') {
        setFeedbackList(prev => {
          const exists = prev.find(f => f.id === updated.id);
          if (exists) return prev.map(f => f.id === updated.id ? { ...updated, order_number: f.order_number } : f);
          return [...prev, updated];
        });
      } else {
        setFeedbackList(prev => prev.filter(f => f.id !== updated.id));
      }
    });

    eventSource.addEventListener('defect_added', (e) => fetchData());
    eventSource.addEventListener('defect_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setFeedbackList(prev => prev.filter(d => d.id !== deleted.id));
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
    if (!window.confirm("Are you sure you want to permanently delete this request?")) return;
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
        body: JSON.stringify({ status: nextStatus, assigned_department: defect.assigned_department })
      });
    } catch (err) {
      console.error("Failed to update feedback", err);
    }
  };

  if (loading) return <div className={styles.loading}>LOADING DESIGN FEEDBACK...</div>;

  const openFeedback = feedbackList.filter(f => f.status === 'open');
  const fixedFeedback = feedbackList.filter(f => f.status === 'fixed');
  const verifiedFeedback = feedbackList.filter(f => f.status === 'verified');

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>Global Design Hub</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
          <Link href="/" className="vtr-btn vtr-btn-secondary">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className={styles.grid}>
        {/* OPEN COLUMN */}
        <section className={styles.column}>
          <h2>Incoming Change Requests <span className={styles.badge}>{openFeedback.length}</span></h2>
          <div className={styles.list}>
            {openFeedback.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No open requests.</p>
            ) : openFeedback.map(f => (
              <div key={f.id} className={styles.card} onClick={() => openEditModal(f)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{f.order_number}</span>
                  <span className={`${styles.severity} ${styles[f.severity]}`}>{f.severity}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {f.source_department}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{f.description}</p>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, f, 'fixed')}>MARK FIXED</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, f.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FIXED COLUMN */}
        <section className={styles.column}>
          <h2>Fixed (Pending Quality Sign-off) <span className={styles.badge}>{fixedFeedback.length}</span></h2>
          <div className={styles.list}>
            {fixedFeedback.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No requests pending verification.</p>
            ) : fixedFeedback.map(f => (
              <div key={f.id} className={styles.card} style={{ borderColor: 'var(--accent-amber)' }} onClick={() => openEditModal(f)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{f.order_number}</span>
                  <span className={`${styles.severity} ${styles[f.severity]}`}>{f.severity}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {f.source_department}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{f.description}</p>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, f, 'open')}>RE-OPEN</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, f.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* VERIFIED COLUMN */}
        <section className={styles.column}>
          <h2>Verified & Cleared <span className={styles.badge}>{verifiedFeedback.length}</span></h2>
          <div className={styles.list}>
            {verifiedFeedback.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No completed requests.</p>
            ) : verifiedFeedback.map(f => (
              <div key={f.id} className={styles.card} style={{ opacity: 0.6, cursor: 'pointer' }} onClick={() => openEditModal(f)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{f.order_number}</span>
                  <span className={`${styles.severity} ${styles[f.severity]}`}>{f.severity}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {f.source_department}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{f.description}</p>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, f, 'open')}>RE-OPEN</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, f.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept="design"
      />
    </main>
  );
}
