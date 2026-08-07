"use client";

import { useState } from "react";
import styles from "./AssemblyModule.module.css";

interface AssemblyTask {
  id: string;
  machine_id: string;
  task_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  signed_off_by: string | null;
  notes: string | null;
}

interface AssemblyModuleProps {
  machineId: string;
  tasks: AssemblyTask[];
}

export function AssemblyModule({ machineId, tasks }: AssemblyModuleProps) {
  const handleStartTask = async (task: AssemblyTask) => {
    try {
      await fetch(`http://localhost:8080/api/assembly/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', notes: '' })
      });
    } catch (err) {
      console.error("Failed to start task", err);
    }
  };

  const handleCompleteTask = async (task: AssemblyTask) => {
    const notes = window.prompt(`Final sign-off notes for "${task.task_name}":\n(Optional)`);
    
    try {
      await fetch(`http://localhost:8080/api/assembly/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'complete', notes: notes ? notes.trim() : '' })
      });
    } catch (err) {
      console.error("Failed to complete task", err);
    }
  };

  const handleDefect = async (task: AssemblyTask) => {
    const desc = window.prompt(`Describe assembly issue regarding "${task.task_name}":`);
    if (!desc || desc.trim() === "") return;

    try {
      await fetch(`http://localhost:8080/api/machines/${machineId}/defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_department: 'assembly', 
          assigned_department: 'assembly',
          severity: 'major',
          description: `[Assembly Issue - ${task.task_name}] ${desc.trim()}`
        })
      });
      window.alert("Assembly Issue logged to the Quality Hub!");
    } catch (err) {
      console.error("Failed to log assembly defect", err);
    }
  };

  const completedCount = tasks.filter(t => t.status === 'complete').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <section className={styles.module}>
      <header className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className={styles.title}>Assembly Tasks</h2>
            <span className={styles.badge}>{completedCount} / {tasks.length} Complete</span>
          </div>
          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </header>
      
      <div className={styles.list}>
        {tasks.length === 0 ? (
          <p className={styles.emptyMessage}>No tasks allocated.</p>
        ) : (
          tasks.map(task => (
            <div key={task.id} className={`${styles.card} ${styles[task.status]}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.taskName}>{task.task_name}</h3>
                <span className={`${styles.statusBadge} ${styles[task.status]}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
              
              {task.notes && (
                <div className={styles.notesBlock}>
                  <strong>Notes:</strong> {task.notes}
                </div>
              )}
              
              {task.signed_off_by && (
                <div className={styles.signOff}>
                  ✓ Signed off by <strong>{task.signed_off_by}</strong>
                </div>
              )}
              
              <div className={styles.actions}>
                {task.status === 'pending' && (
                  <button 
                    className={styles.startBtn} 
                    onClick={() => handleStartTask(task)}
                  >
                    START TASK
                  </button>
                )}
                {task.status === 'in_progress' && (
                  <button 
                    className={styles.completeBtn} 
                    onClick={() => handleCompleteTask(task)}
                  >
                    SIGN OFF & COMPLETE
                  </button>
                )}
                {task.status !== 'complete' && (
                  <button 
                    className={styles.issueBtn} 
                    onClick={() => handleDefect(task)}
                    title="Report Issue"
                  >
                    ⚠️
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
