"use client";

import React, { useState } from "react";
import { fetchApi } from "../lib/api";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import styles from "../app/(main)/kickoff/kickoff.module.css";

interface SalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SalesOrderModal({ isOpen, onClose, onSuccess }: SalesOrderModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [internalProjectNumber, setInternalProjectNumber] = useState("");
  const [projectName, setProjectName] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const resetForm = () => {
    setCustomerName("");
    setPoNumber("");
    setInternalProjectNumber("");
    setProjectName("");
    setResponsiblePerson("");
    setSalesRep("");
    setTargetDate("");
  };

  useAppHotkeys('escape', () => {
    if (isOpen) {
      onClose();
      resetForm();
    }
  }, { enableOnFormTags: true }, [isOpen, onClose]);

  const createOrder = async () => {
    if (!customerName || !poNumber) return;
    try {
      await fetchApi("sales_orders", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName,
          po_number: poNumber,
          internal_project_number: internalProjectNumber,
          project_name: projectName,
          responsible_person: responsiblePerson,
          sales_rep: salesRep,
          target_ship_date: targetDate ? new Date(targetDate).toISOString() : undefined,
        }),
      });
      resetForm();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to create order", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrder();
  };

  useAppHotkeys('mod+enter', (e) => {
    if (isOpen) {
      e.preventDefault();
      createOrder();
    }
  }, { enableOnFormTags: true }, [isOpen, customerName, poNumber, internalProjectNumber, projectName, responsiblePerson, salesRep, targetDate]);

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
          maxWidth: '600px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1.5rem", color: "var(--vtr-theme-primary)", fontFamily: 'var(--font-mono)' }}>New Sales Order</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Customer Name</label>
              <input required className={styles.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Acme Corp" autoFocus />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>PO Number</label>
              <input required className={styles.input} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-12345" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Internal Project #</label>
              <input className={styles.input} value={internalProjectNumber} onChange={e => setInternalProjectNumber(e.target.value)} placeholder="PRJ-9942" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Project Name</label>
              <input className={styles.input} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="VibroBowl Automation" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Responsible Person (PM)</label>
              <input className={styles.input} value={responsiblePerson} onChange={e => setResponsiblePerson(e.target.value)} placeholder="Bob Manager" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sales Rep</label>
              <input className={styles.input} value={salesRep} onChange={e => setSalesRep(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Target Ship Date</label>
              <input type="date" className={styles.input} value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="vtr-btn" style={{ flex: 1 }}>Create Order</button>
            <button type="button" className="vtr-btn vtr-btn-secondary" onClick={() => { onClose(); resetForm(); }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
