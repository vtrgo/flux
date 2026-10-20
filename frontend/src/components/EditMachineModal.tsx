"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { Machine } from "../types";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toCalendarDateInput, calendarDateToUtcNoon } from "../lib/dateUtils";
import { Modal } from "./ui/Modal";
import formStyles from "./ui/Form.module.css";

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

  if (!machine) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configure Machine"
      subtitle={`Machine S/N: ${machine.order_number}`}
      size="sm"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>Part / Model Type</label>
          <input 
            required 
            className={formStyles.input} 
            value={modelType} 
            onChange={e => setModelType(e.target.value)} 
            placeholder="e.g. Housing Base" 
            autoFocus 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>S/N or Tracking Number</label>
          <input 
            required 
            className={formStyles.input} 
            value={orderNumber} 
            onChange={e => setOrderNumber(e.target.value)} 
            placeholder="e.g. SN-9982" 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>F.A.T. (Factory Acceptance Test) Date</label>
          <input 
            type="date" 
            className={formStyles.input} 
            value={fatDate} 
            onChange={e => setFatDate(e.target.value)} 
          />
        </div>
        <div className={formStyles.formGroup}>
          <label className={formStyles.label}>Lead (Project Lead)</label>
          <input 
            className={formStyles.input} 
            value={lead} 
            onChange={e => setLead(e.target.value)} 
            placeholder="e.g. Jane Doe" 
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
          <button type="submit" className="vtr-btn" style={{ flex: 1 }} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Machine"}
          </button>
          <button type="button" className="vtr-btn vtr-btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
