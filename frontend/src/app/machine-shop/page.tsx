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
  status: string;
}

interface MachineShopTask {
  id: string;
  machine_id: string;
  order_number: string;
  defect_id: string | null;
  part_name: string;
  material: string;
  status: string;
}

export default function MachineShopHub() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [tasks, setTasks] = useState<MachineShopTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [defRes, tasksRes] = await Promise.all([
          fetch(`http://localhost:8080/api/defects`),
          fetch(`http://localhost:8080/api/machine-shop/tasks`)
        ]);
        
        const allDefects: Defect[] = await defRes.json() || [];
        setDefects(allDefects.filter(d => d.assigned_department === 'machine_shop' && d.status === 'open'));
        
        setTasks(await tasksRes.json() || []);
      } catch (err) {
        console.error("Failed to load machine shop data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    
    eventSource.addEventListener('defect_updated', (e) => {
      const updated = JSON.parse(e.data);
      if (updated.assigned_department === 'machine_shop' && updated.status === 'open') {
        setDefects(prev => {
          const exists = prev.find(f => f.id === updated.id);
          if (exists) return prev.map(f => f.id === updated.id ? { ...updated, order_number: f.order_number } : f);
          return [...prev, updated];
        });
      } else {
        setDefects(prev => prev.filter(f => f.id !== updated.id));
      }
    });

    eventSource.addEventListener('defect_added', () => fetchData());
    eventSource.addEventListener('defect_deleted', (e) => {
      const deleted = JSON.parse(e.data);
      setDefects(prev => prev.filter(d => d.id !== deleted.id));
    });

    eventSource.addEventListener('machine_shop_task_updated', (e) => {
      const updatedTask = JSON.parse(e.data);
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...updatedTask, order_number: t.order_number } : t));
    });

    eventSource.addEventListener('machine_shop_task_added', (e) => {
      const newTask = JSON.parse(e.data);
      setTasks(prev => [newTask, ...prev]);
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

  const handleCreateTask = async (defect: Defect) => {
    const partName = window.prompt(`Enter part to machine for defect:\n"${defect.description}"`);
    if (!partName) return;
    
    const material = window.prompt("Enter material (e.g., Al 6061, Steel, Delrin):");
    if (!material) return;

    try {
      await fetch(`http://localhost:8080/api/machine-shop/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: defect.machine_id,
          defect_id: defect.id,
          part_name: partName.trim(),
          material: material.trim()
        })
      });
      
      // Auto-mark the defect as 'fixed' since machining has started/been scheduled
      await fetch(`http://localhost:8080/api/defects/${defect.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fixed', assigned_department: defect.assigned_department })
      });
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  const handleTaskClick = async (task: MachineShopTask) => {
    let nextStatus = task.status;
    if (task.status === 'pending') nextStatus = 'machining';
    else if (task.status === 'machining') nextStatus = 'complete';
    else return;

    try {
      await fetch(`http://localhost:8080/api/machine-shop/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch (err) {
      console.error("Failed to update task", err);
    }
  };

  if (loading) return <div className={styles.loading}>SPINNING UP SPINDLE...</div>;

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const activeTasks = tasks.filter(t => t.status === 'machining');
  const completeTasks = tasks.filter(t => t.status === 'complete');

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-accent)' }}>Machine Shop Hub</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
          <Link href="/" className="vtr-btn vtr-btn-secondary">
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* Incoming Defect Queue */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
          Incoming Rework Requests <span className={styles.badge}>{defects.length}</span>
        </h2>
        <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
          {defects.length === 0 ? (
            <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No defects assigned to Machine Shop.</p>
          ) : defects.map(defect => (
            <div key={defect.id} className={styles.card} style={{ minWidth: '300px' }} onClick={() => openEditModal(defect)}>
              <div className={styles.cardHeader}>
                <span className={styles.orderNumber}>{defect.order_number}</span>
                <span className={`${styles.severity} ${styles[defect.severity]}`}>{defect.severity}</span>
              </div>
              <p className={styles.description}>{defect.description}</p>
              <div className={styles.actions} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="vtr-btn" 
                  style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem', borderColor: 'var(--vtr-theme-accent)', color: 'var(--vtr-theme-accent)' }} 
                  onClick={(e) => { e.stopPropagation(); handleCreateTask(defect); }}
                >
                  CREATE MACHINE TASK
                </button>
                <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, defect.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Machining Queue */}
      <div className={styles.grid}>
        {/* PENDING COLUMN */}
        <section className={styles.column}>
          <h2>Pending Tasks <span className={styles.badge}>{pendingTasks.length}</span></h2>
          <div className={styles.list}>
            {pendingTasks.map(task => (
              <div key={task.id} className={styles.card} onClick={() => handleTaskClick(task)}>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{task.part_name}</h3>
                <p style={{ color: 'var(--vtr-theme-neutral)', fontSize: '0.875rem', marginBottom: '1rem' }}>Material: {task.material}</p>
                <div style={{ color: 'var(--accent-amber)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>STATUS: {task.status}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MACHINING COLUMN */}
        <section className={styles.column}>
          <h2>Active Machining <span className={styles.badge}>{activeTasks.length}</span></h2>
          <div className={styles.list}>
            {activeTasks.map(task => (
              <div key={task.id} className={styles.card} onClick={() => handleTaskClick(task)} style={{ borderColor: 'var(--vtr-theme-accent)' }}>
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{task.part_name}</h3>
                <p style={{ color: 'var(--vtr-theme-neutral)', fontSize: '0.875rem', marginBottom: '1rem' }}>Material: {task.material}</p>
                <div style={{ color: 'var(--vtr-theme-accent)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>STATUS: {task.status}</div>
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
                <h3 style={{ color: 'var(--vtr-theme-primary)', marginBottom: '0.5rem' }}>{task.part_name}</h3>
                <p style={{ color: 'var(--vtr-theme-neutral)', fontSize: '0.875rem', marginBottom: '1rem' }}>Material: {task.material}</p>
                <div style={{ color: 'var(--accent-green)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>STATUS: {task.status}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept="machine_shop"
      />
    </main>
  );
}
