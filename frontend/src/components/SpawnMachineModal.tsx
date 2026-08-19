"use client";

import React, { useState } from "react";
import { fetchApi } from "../lib/api";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import styles from "../app/(main)/kickoff/kickoff.module.css";

interface SpawnMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderName: string;
  onSuccess?: () => void;
}

export function SpawnMachineModal({ isOpen, onClose, orderId, orderName, onSuccess }: SpawnMachineModalProps) {
  const [newMachineModel, setNewMachineModel] = useState("");
  const [newMachineSN, setNewMachineSN] = useState("");

  const resetForm = () => {
    setNewMachineModel("");
    setNewMachineSN("");
  };

  useAppHotkeys('escape', () => {
    if (isOpen) {
      onClose();
      resetForm();
    }
  }, { enableOnFormTags: true }, [isOpen, onClose]);

  const spawnMachine = async () => {
    if (!newMachineModel || !newMachineSN) return;
    try {
      await fetchApi("machines", {
        method: "POST",
        body: JSON.stringify({
          sales_order_id: orderId,
          order_number: newMachineSN,
          model_type: newMachineModel,
        }),
      });
      resetForm();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to spawn machine", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    spawnMachine();
  };

  useAppHotkeys('mod+enter', (e) => {
    if (isOpen) {
      e.preventDefault();
      spawnMachine();
    }
  }, { enableOnFormTags: true }, [isOpen, newMachineModel, newMachineSN, orderId]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }} 
      onClick={() => { onClose(); resetForm(); }}
    >
      <div 
        style={{
          background: 'var(--vtr-card-bg, #1a1a1a)',
          border: '1px solid var(--vtr-card-border, #333)',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '500px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1.5rem", color: "var(--vtr-theme-primary)", fontFamily: 'var(--font-mono)' }}>Spawn Machine - {orderName}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Part / Model Type</label>
            <input 
              required 
              className={styles.input} 
              value={newMachineModel} 
              onChange={e => setNewMachineModel(e.target.value)} 
              placeholder="e.g. Housing Base" 
              autoFocus 
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>S/N or Tracking Number</label>
            <input 
              required 
              className={styles.input} 
              value={newMachineSN} 
              onChange={e => setNewMachineSN(e.target.value)} 
              placeholder="e.g. SN-9982" 
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="vtr-btn" style={{ flex: 1 }}>Spawn Machine</button>
            <button type="button" className="vtr-btn vtr-btn-secondary" onClick={() => { onClose(); resetForm(); }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
