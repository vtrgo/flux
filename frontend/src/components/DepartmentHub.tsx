"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../app/quality/quality.module.css";
import { IssueModal } from "./IssueModal";

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

interface DepartmentHubProps {
  title: string;
  departmentKey: string;
}

export function DepartmentHub({ title, departmentKey }: DepartmentHubProps) {
  const [issues, setIssues] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const defectsRes = await fetch(`http://localhost:8080/api/defects`);
        const allDefects: Defect[] = await defectsRes.json() || [];
        setIssues(allDefects.filter(d => d.assigned_department === departmentKey));
      } catch (err) {
        console.error(`Failed to load data for ${departmentKey}`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.assigned_department === departmentKey) {
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
  }, [departmentKey]);

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
    if (!confirm("Are you sure you want to delete this issue?")) return;
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
        body: JSON.stringify({ status: nextStatus })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (loading) return <div className={styles.loading}>LOADING {title.toUpperCase()}...</div>;

  const issuesByMachine = issues.reduce((acc, issue) => {
    if (!acc[issue.machine_id]) {
      acc[issue.machine_id] = { order_number: issue.order_number, issues: [] };
    }
    acc[issue.machine_id].issues.push(issue);
    return acc;
  }, {} as Record<string, { order_number: string, issues: Defect[] }>);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>{title}</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
          <Link href="/" className="vtr-btn vtr-btn-secondary">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginBottom: '3rem' }}>
        {Object.entries(issuesByMachine).length === 0 ? (
          <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No assigned issues.</p>
        ) : Object.entries(issuesByMachine).map(([machineId, group]) => {
          const openF = group.issues.filter(f => f.status === 'open');
          const fixedF = group.issues.filter(f => f.status === 'fixed');
          const verifiedF = group.issues.filter(f => f.status === 'verified');
          
          return (
            <div key={machineId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>{group.order_number} <span className={styles.badge}>{group.issues.length}</span></h2>
                <Link href={`/machine/${machineId}`} className="vtr-btn vtr-btn-secondary">{group.order_number} Portal →</Link>
              </div>
              <div className={styles.grid}>
                {/* OPEN COLUMN */}
                <section className={styles.column}>
                  <h3>Open Issues <span className={styles.badge}>{openF.length}</span></h3>
                  <div className={styles.list}>
                    {openF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No open issues.</p>
                    ) : openF.map(issue => (
                      <div key={issue.id} className={styles.card} onClick={() => openEditModal(issue)}>
                        <div className={styles.cardHeader}>
                          <span className={styles.orderNumber}>{issue.order_number}</span>
                          <span className={`${styles.severity} ${styles[issue.severity]}`}>{issue.status}</span>
                        </div>
                        <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {issue.source_department}</h3>
                        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{issue.description}</p>
                        {issue.notes && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {issue.notes}
                          </div>
                        )}
                        <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'fixed')}>MARK FIXED</button>
                          <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* FIXED COLUMN */}
                <section className={styles.column}>
                  <h3>Fixed (Pending Sign-off) <span className={styles.badge}>{fixedF.length}</span></h3>
                  <div className={styles.list}>
                    {fixedF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No issues pending verification.</p>
                    ) : fixedF.map(issue => (
                      <div key={issue.id} className={styles.card} style={{ borderColor: 'var(--accent-amber)' }} onClick={() => openEditModal(issue)}>
                        <div className={styles.cardHeader}>
                          <span className={styles.orderNumber}>{issue.order_number}</span>
                          <span className={`${styles.severity} ${styles[issue.severity]}`}>{issue.status}</span>
                        </div>
                        <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {issue.source_department}</h3>
                        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{issue.description}</p>
                        {issue.notes && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {issue.notes}
                          </div>
                        )}
                        <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-green)', color: 'var(--accent-green)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'verified')}>SIGN OFF</button>
                          <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'open')}>REJECT</button>
                          <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* VERIFIED COLUMN */}
                <section className={styles.column}>
                  <h3>Verified & Cleared <span className={styles.badge}>{verifiedF.length}</span></h3>
                  <div className={styles.list}>
                    {verifiedF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No completed issues.</p>
                    ) : verifiedF.map(issue => (
                      <div key={issue.id} className={styles.card} style={{ opacity: 0.6, cursor: 'pointer' }} onClick={() => openEditModal(issue)}>
                        <div className={styles.cardHeader}>
                          <span className={styles.orderNumber}>{issue.order_number}</span>
                          <span className={`${styles.severity} ${styles[issue.severity]}`}>{issue.status}</span>
                        </div>
                        <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem', fontSize: '1rem' }}>Source: {issue.source_department}</h3>
                        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{issue.description}</p>
                        {issue.notes && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            <strong style={{ color: 'var(--vtr-theme-secondary)' }}>Note:</strong> {issue.notes}
                          </div>
                        )}
                        <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'open')}>RE-OPEN</button>
                          <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          );
        })}
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept={departmentKey}
      />
    </main>
  );
}
