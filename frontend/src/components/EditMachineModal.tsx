"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { Machine } from "../types";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toCalendarDateInput, calendarDateToUtcNoon } from "../lib/dateUtils";
import styles from "../app/(main)/kickoff/kickoff.module.css";

interface EditMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  onSuccess?: () => void;
}

export function EditMachineModal({ isOpen, onClose, machine, onSuccess }: EditMachineModalProps) {
  const [modelType, setModelType] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [fatDate, setFatDate] = useState("");
  const [lead, setLead] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (machine) {
      setModelType(machine.model_type || "");
      setOrderNumber(machine.order_number || "");
      setLead(machine.lead || "");
      setFatDate(toCalendarDateInput(machine.fat_date));
    }
  }, [machine]);

  useAppHotkeys('escape', () => {
    if (isOpen) {
      onClose();
    }
  }, { enableOnFormTags: true }, [isOpen, onClose]);

  const handleUpdate = async () => {
    if (!machine || !modelType || !orderNumber) return;
    setIsSubmitting(true);
    try {
      await fetchApi(`machines/${machine.id}`, {
        method: "PUT",
        body: JSON.stringify({
          order_number: orderNumber,
          model_type: modelType,
          fat_date: calendarDateToUtcNoon(fatDate) || null,
          lead: lead || null,
        }),
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update machine", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleUpdate();
  };

  useAppHotkeys('mod+enter', (e) => {
    if (isOpen) {
      e.preventDefault();
      handleUpdate();
    }
  }, { enableOnFormTags: true }, [isOpen, machine, modelType, orderNumber, fatDate, lead]);

  if (!isOpen || !machine) return null;

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
      onClick={onClose}
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
        <h2 style={{ marginBottom: "1.5rem", color: "var(--vtr-theme-primary)", fontFamily: 'var(--font-mono)' }}>
          Configure Machine - {machine.order_number}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Part / Model Type</label>
            <input 
              required 
              className={styles.input} 
              value={modelType} 
              onChange={e => setModelType(e.target.value)} 
              placeholder="e.g. Housing Base" 
              autoFocus 
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>S/N or Tracking Number</label>
            <input 
              required 
              className={styles.input} 
              value={orderNumber} 
              onChange={e => setOrderNumber(e.target.value)} 
              placeholder="e.g. SN-9982" 
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>F.A.T. (Factory Acceptance Test) Date</label>
            <input 
              type="date" 
              className={styles.input} 
              value={fatDate} 
              onChange={e => setFatDate(e.target.value)} 
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Lead (Project Lead)</label>
            <input 
              className={styles.input} 
              value={lead} 
              onChange={e => setLead(e.target.value)} 
              placeholder="e.g. Jane Doe" 
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="vtr-btn" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Machine"}
            </button>
            <button type="button" className="vtr-btn vtr-btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
