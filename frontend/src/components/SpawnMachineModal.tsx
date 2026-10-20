"use client";

import React, { useState } from "react";
import { fetchApi } from "../lib/api";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { calendarDateToUtcNoon } from "../lib/dateUtils";
import { Modal } from "./ui/Modal";
import formStyles from "./ui/Form.module.css";

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
  const [newMachineFatDate, setNewMachineFatDate] = useState("");
  const [newMachineLead, setNewMachineLead] = useState("");

  const resetForm = () => {
    setNewMachineModel("");
    setNewMachineSN("");
    setNewMachineFatDate("");
    setNewMachineLead("");
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const spawnMachine = async () => {
    if (!newMachineModel || !newMachineSN) return;
    try {
      await fetchApi("machines", {
        method: "POST",
        body: JSON.stringify({
          sales_order_id: orderId,
          order_number: newMachineSN,
          model_type: newMachineModel,
          fat_date: calendarDateToUtcNoon(newMachineFatDate),
          lead: newMachineLead || undefined,
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Spawn Machine"
      subtitle={`Project / Order: ${orderName}`}
      size="sm"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>Part / Model Type</label>
          <input 
            required 
            className={formStyles.input} 
            value={newMachineModel} 
            onChange={e => setNewMachineModel(e.target.value)} 
            placeholder="e.g. Housing Base" 
            autoFocus 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>S/N or Tracking Number</label>
          <input 
            required 
            className={formStyles.input} 
            value={newMachineSN} 
            onChange={e => setNewMachineSN(e.target.value)} 
            placeholder="e.g. SN-9982" 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>F.A.T. (Factory Acceptance Test) Date</label>
          <input 
            type="date" 
            className={formStyles.input} 
            value={newMachineFatDate} 
            onChange={e => setNewMachineFatDate(e.target.value)} 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>Lead (Project Lead)</label>
          <input 
            className={formStyles.input} 
            value={newMachineLead} 
            onChange={e => setNewMachineLead(e.target.value)} 
            placeholder="e.g. Jane Doe" 
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
          <button type="submit" className="vtr-btn" style={{ flex: 1 }}>Spawn Machine</button>
          <button type="button" className="vtr-btn vtr-btn-secondary" onClick={handleClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
