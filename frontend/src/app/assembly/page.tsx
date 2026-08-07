"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../quality/quality.module.css";

import { IssueModal } from "../../components/IssueModal";

interface AssemblyTask {
  id: string;
  machine_id: string;
  order_number: string;
  task_name: string;
  status: string;
  notes: string | null;
  signed_off_by: string | null;
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

export default function AssemblyHub() {
  const [tasks, setTasks] = useState<AssemblyTask[]>([]);
  const [issues, setIssues] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, defectsRes] = await Promise.all([
          fetch(`http://localhost:8080/api/assembly`),
          fetch(`http://localhost:8080/api/defects`)
        ]);
        setTasks(await tasksRes.json() || []);
        
        const allDefects: Defect[] = await defectsRes.json() || [];
        setIssues(allDefects.filter(d => d.assigned_department === 'assembly' && d.status !== 'verified'));
      } catch (err) {
        console.error("Failed to load assembly data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('assembly_task_updated', (e) => {
      const updatedTask = JSON.parse(e.data);
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...updatedTask, order_number: t.order_number } : t));
    });

    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.assigned_department === 'assembly' && updated.status !== 'verified') {
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

  const handleUpdateStatus = async (task: AssemblyTask) => {
    let nextStatus = '';
    let notes = '';

    if (task.status === 'pending') {
      nextStatus = 'in_progress';
    } else if (task.status === 'in_progress') {
      const input = window.prompt(`Final sign-off notes for "${task.task_name}":\n(Optional)`);
      if (input === null) return;
      notes = input.trim();
      nextStatus = 'complete';
    } else {
      return;
    }

    try {
      await fetch(`http://localhost:8080/api/assembly/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, notes })
      });
    } catch (err) {
      console.error("Failed to update task", err);
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

  if (loading) return <div className={styles.loading}>LOADING ASSEMBLY TASKS...</div>;

  const pendingTasks = tasks.filter(t => t.status !== 'complete');
  const completeTasks = tasks.filter(t => t.status === 'complete');

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>Global Assembly Hub</h1>
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
          <h2>Pending Tasks <span className={styles.badge}>{pendingTasks.length}</span></h2>
          <div className={styles.list}>
            {pendingTasks.map(task => (
              <div key={task.id} className={styles.card} onClick={() => handleUpdateStatus(task)}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{task.order_number}</span>
                  <span className={styles.severity} style={{ color: task.status === 'in_progress' ? 'var(--vtr-theme-primary)' : 'var(--accent-amber)', borderColor: task.status === 'in_progress' ? 'var(--vtr-theme-primary)' : 'var(--accent-amber)' }}>{task.status.replace('_', ' ').toUpperCase()}</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{task.task_name}</h3>
                {task.status === 'pending' && <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Click to Start</p>}
                {task.status === 'in_progress' && <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Click to Sign-off</p>}
              </div>
            ))}
          </div>
        </section>

        {/* COMPLETE COLUMN */}
        <section className={styles.column}>
          <h2>Completed <span className={styles.badge}>{completeTasks.length}</span></h2>
          <div className={styles.list}>
            {completeTasks.map(task => (
              <div key={task.id} className={styles.card} style={{ opacity: 0.6, cursor: 'default' }}>
                <div className={styles.cardHeader}>
                  <span className={styles.orderNumber}>{task.order_number}</span>
                  <span className={styles.severity} style={{ color: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}>COMPLETE</span>
                </div>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{task.task_name}</h3>
                {task.notes && <p style={{ color: 'var(--vtr-theme-neutral)', fontSize: '0.875rem' }}>Notes: {task.notes}</p>}
                {task.signed_off_by && <p style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>✓ {task.signed_off_by}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept="assembly"
      />
    </main>
  );
}
