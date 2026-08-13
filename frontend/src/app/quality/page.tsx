"use client";

import { useEffect, useState } from "react";
import { useSSE } from "../../components/SSEProvider";
import Link from "next/link";
import styles from "./quality.module.css";
import { Machine, Defect } from "../../types";

import { IssueModal } from "../../components/IssueModal";

export default function QualityResolutionHub() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  const fetchData = async () => {
    try {
      const [defRes, macRes] = await Promise.all([
        fetch(`http://localhost:8080/api/defects`),
        fetch(`http://localhost:8080/api/machines`)
      ]);
      setDefects(await defRes.json() || []);
      setMachines(await macRes.json() || []);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  useSSE('defect_updated', (updatedDefect: Defect) => {
    setDefects(prev => prev.map(d => 
      d.id === updatedDefect.id ? { ...updatedDefect, order_number: d.order_number } : d
    ));
  });

  useSSE('defect_added', () => fetchData());
  
  useSSE('defect_deleted', (deleted: { id: string }) => {
    setDefects(prev => prev.filter(d => d.id !== deleted.id));
  });

  useSSE('machine_created', () => fetchData());
  useSSE('machine_deleted', () => fetchData());

  useEffect(() => {
    fetchData();
  }, []);

  const openNewModal = () => {
    setEditingDefect(null);
    setIsModalOpen(true);
  };

  const openEditModal = (defect: Defect) => {
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

  const openDefects = defects.filter(d => d.status === 'open');
  const fixedDefects = defects.filter(d => d.status === 'fixed');
  const verifiedDefects = defects.filter(d => d.status === 'verified');

  if (loading) return <div className={styles.loading}>INITIALIZING HUB...</div>;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Global Quality & ECR Portal</h1>
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
          <h2>
            Open Issues
            <span className={styles.badge}>{openDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {openDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No open issues.</p>
            ) : openDefects.map(defect => (
              <div key={defect.id} className={styles.card} onClick={() => openEditModal(defect)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{defect.order_number}</span>
                  <span className={`${styles.severity} ${styles[defect.severity]}`}>{defect.severity}</span>
                </div>
                <p className={styles.description}>{defect.description}</p>
                {defect.notes && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {defect.notes}
                  </div>
                )}
                <div className={styles.department}>
                  <span>Src: {defect.source_department}</span>
                  <span style={{ color: 'var(--vtr-theme-primary)' }}>Rout: {defect.assigned_department}</span>
                </div>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'fixed')}>MARK FIXED</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FIXED COLUMN */}
        <section className={styles.column}>
          <h2>
            Fixed (Pending Verification)
            <span className={styles.badge}>{fixedDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {fixedDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No fixes pending verification.</p>
            ) : fixedDefects.map(defect => (
              <div key={defect.id} className={styles.card} onClick={() => openEditModal(defect)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{defect.order_number}</span>
                  <span className={`${styles.severity} ${styles[defect.severity]}`}>{defect.severity}</span>
                </div>
                <p className={styles.description}>{defect.description}</p>
                {defect.notes && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {defect.notes}
                  </div>
                )}
                <div className={styles.department}>
                  <span>Src: {defect.source_department}</span>
                  <span style={{ color: 'var(--vtr-theme-primary)' }}>Rout: {defect.assigned_department}</span>
                </div>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-green)', color: 'var(--accent-green)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'verified')}>SIGN OFF</button>
                  <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'open')}>REJECT</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* VERIFIED COLUMN */}
        <section className={styles.column}>
          <h2>
            Signed Off / Cleared
            <span className={styles.badge}>{verifiedDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {verifiedDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No cleared issues.</p>
            ) : verifiedDefects.map(defect => (
              <div key={defect.id} className={styles.card} style={{ opacity: 0.6 }} onClick={() => openEditModal(defect)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{defect.order_number}</span>
                  <span className={`${styles.severity} ${styles[defect.severity]}`}>{defect.severity}</span>
                </div>
                <p className={styles.description}>{defect.description}</p>
                {defect.notes && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {defect.notes}
                  </div>
                )}
                <div className={styles.department}>
                  <span>Src: {defect.source_department}</span>
                  <span style={{ color: 'var(--vtr-theme-primary)' }}>Rout: {defect.assigned_department}</span>
                </div>
                <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, defect, 'open')}>RE-OPEN</button>
                  <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
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
      />
    </main>
  );
}
