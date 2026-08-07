"use client";

import { useState } from "react";
import styles from "./KittingModule.module.css";

interface KittingPart {
  id: string;
  machine_id: string;
  department: string;
  part_number: string;
  description: string;
  qty_required: number;
  qty_picked: number;
  status: string;
}

interface KittingModuleProps {
  machineId: string;
  parts: KittingPart[];
}

export function KittingModule({ machineId, parts }: KittingModuleProps) {
  const handleUpdate = async (part: KittingPart) => {
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
      console.error("Failed to update kitting part", err);
    }
  };

  const handleDefect = async (part: KittingPart) => {
    const desc = window.prompt(`Describe issue with ${part.part_number}:`);
    if (!desc || desc.trim() === "") return;

    try {
      await fetch(`http://localhost:8080/api/machines/${machineId}/defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_department: 'kitting', 
          assigned_department: 'kitting',
          severity: 'major',
          description: `[Kitting Issue - ${part.part_number}] ${desc.trim()}`
        })
      });
      window.alert("Kitting Issue logged to the Quality Hub!");
    } catch (err) {
      console.error("Failed to log kitting defect", err);
    }
  };

  const fulfilledCount = parts.filter(p => p.status === 'fulfilled').length;
  const progressPercent = parts.length > 0 ? Math.round((fulfilledCount / parts.length) * 100) : 0;

  return (
    <section className={styles.module}>
      <header className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className={styles.title}>Kitting BOM</h2>
            <span className={styles.badge}>{fulfilledCount} / {parts.length} Fulfilled</span>
          </div>
          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </header>
      
      <div className={styles.list}>
        {parts.length === 0 ? (
          <p className={styles.emptyMessage}>No BOM allocated.</p>
        ) : (
          parts.map(part => (
            <div key={part.id} className={`${styles.card} ${part.status === 'fulfilled' ? styles.fulfilled : ''}`}>
              <div className={styles.cardInfo}>
                <span className={styles.partNumber}>{part.part_number}</span>
                <span className={`${styles.statusBadge} ${styles[part.status]}`}>{part.status}</span>
              </div>
              <p className={styles.description}>{part.description}</p>
              
              <div className={styles.qtyContainer}>
                <span>QTY: {part.qty_picked} / {part.qty_required}</span>
                <div className={styles.qtyBarBg}>
                  <div 
                    className={styles.qtyBarFill} 
                    style={{ width: `${Math.min((part.qty_picked / part.qty_required) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className={styles.actions}>
                <button 
                  className={styles.updateBtn} 
                  onClick={() => handleUpdate(part)}
                  disabled={part.status === 'fulfilled'}
                >
                  UPDATE QTY
                </button>
                <button 
                  className={styles.issueBtn} 
                  onClick={() => handleDefect(part)}
                  title="Report Issue (Missing, Broken, etc)"
                >
                  ⚠️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
