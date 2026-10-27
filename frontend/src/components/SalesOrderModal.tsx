"use client";

import React, { useState } from "react";
import { fetchApi } from "../lib/api";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { calendarDateToUtcNoon } from "../lib/dateUtils";
import { Modal } from "./ui/Modal";
import formStyles from "./ui/Form.module.css";

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

  const handleClose = () => {
    onClose();
    resetForm();
  };

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
          target_ship_date: calendarDateToUtcNoon(targetDate),
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Sales Order"
      subtitle="Register an incoming project or machine build"
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className={formStyles.formGrid}>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_customer_name" className={formStyles.label}>Customer Name</label>
            <input id="so_customer_name" required className={formStyles.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Acme Corp" autoFocus />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_po_number" className={formStyles.label}>PO Number</label>
            <input id="so_po_number" required className={formStyles.input} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-12345" />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_internal_project_number" className={formStyles.label}>Internal Project #</label>
            <input id="so_internal_project_number" className={formStyles.input} value={internalProjectNumber} onChange={e => setInternalProjectNumber(e.target.value)} placeholder="PRJ-9942" />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_project_name" className={formStyles.label}>Project Name</label>
            <input id="so_project_name" className={formStyles.input} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="VibroBowl Automation" />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_responsible_person" className={formStyles.label}>Responsible Person (PM)</label>
            <input id="so_responsible_person" className={formStyles.input} value={responsiblePerson} onChange={e => setResponsiblePerson(e.target.value)} placeholder="Bob Manager" />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_sales_rep" className={formStyles.label}>Sales Rep</label>
            <input id="so_sales_rep" className={formStyles.input} value={salesRep} onChange={e => setSalesRep(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className={formStyles.formGroup}>
            <label htmlFor="so_target_date" className={formStyles.label}>Target Ship Date</label>
            <input id="so_target_date" type="date" className={formStyles.input} value={targetDate} onChange={e => setTargetDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
          <button type="submit" className="vtr-btn" style={{ flex: 1 }}>Create Order</button>
          <button type="button" className="vtr-btn vtr-btn-secondary" onClick={handleClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
