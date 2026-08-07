"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../quality/quality.module.css";

import { IssueModal } from "../../components/IssueModal";

interface ControlsCheckpoint {
  id: string;
  machine_id: string;
  order_number: string;
  checkpoint_type: string;
  description: string;
  expected_value: string;
  actual_value: string;
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

export default function ControlsHub() {
  const [checks, setChecks] = useState<ControlsCheckpoint[]>([]);
  const [issues, setIssues] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [checksRes, defectsRes] = await Promise.all([
          fetch(`http://localhost:8080/api/controls`),
          fetch(`http://localhost:8080/api/defects`)
        ]);
        setChecks(await checksRes.json() || []);
        
        const allDefects: Defect[] = await defectsRes.json() || [];
        setIssues(allDefects.filter(d => (d.assigned_department === 'electrical_controls' || d.assigned_department === 'controls') && d.status !== 'verified'));
      } catch (err) {
        console.error("Failed to load controls data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('controls_checkpoint_updated', (e) => {
      const updatedCheck = JSON.parse(e.data);
      setChecks(prev => prev.map(c => c.id === updatedCheck.id ? { ...updatedCheck, order_number: c.order_number } : c));
    });

    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if ((updated.assigned_department === 'electrical_controls' || updated.assigned_department === 'controls') && updated.status !== 'verified') {
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

  const handleUpdate = async (chk: ControlsCheckpoint) => {
    if (chk.status === 'pass') return;
    
    const actualValue = window.prompt(`Enter actual value read for ${chk.checkpoint_type}\nExpected: ${chk.expected_value}`);
    if (actualValue === null || actualValue.trim() === "") return;

    try {
      await fetch(`http://localhost:8080/api/controls/${chk.id}`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_value: actualValue.trim() })
      });
    } catch (err) {
      console.error("Failed to update checkpoint", err);
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

  if (loading) return <div className={styles.loading}>LOADING CONTROLS CHECKPOINTS...</div>;

  const pendingChecks = checks.filter(c => c.status === 'pending');
  const passChecks = checks.filter(c => c.status === 'pass');

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>Global Electrical / Controls Hub</h1>
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
          <h2>Pending Checkpoints <span className={styles.badge}>{pendingChecks.length}</span></h2>
          <div className={styles.list}>
            {pendingChecks.map(chk => (
              <div key={chk.id} className={styles.card} onClick={() => handleUpdate(chk)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{chk.order_number}</span>
                  <span className={styles.severity} style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }}>PENDING</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{chk.checkpoint_type}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{chk.description}</p>
                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>EXPECTED: {chk.expected_value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PASS COLUMN */}
        <section className={styles.column}>
          <h2>Passed <span className={styles.badge}>{passChecks.length}</span></h2>
          <div className={styles.list}>
            {passChecks.map(chk => (
              <div key={chk.id} className={styles.card} style={{ opacity: 0.6, cursor: 'default' }}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{chk.order_number}</span>
                  <span className={styles.severity} style={{ color: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}>PASS</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{chk.checkpoint_type}</h3>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{chk.description}</p>
                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-green)' }}>
                  ACTUAL: {chk.actual_value}
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
        defaultAssignedDept="electrical_controls"
      />
    </main>
  );
}
