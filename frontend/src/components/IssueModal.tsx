"use client";

import React, { useState, useEffect } from "react";
import styles from "../app/quality/quality.module.css";

interface Machine {
  id: string;
  order_number: string;
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

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDefect: Defect | null;
  defaultAssignedDept?: string;
}

export function IssueModal({ isOpen, onClose, editingDefect, defaultAssignedDept = 'quality' }: IssueModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [formData, setFormData] = useState({
    machine_id: '',
    source_department: defaultAssignedDept,
    assigned_department: defaultAssignedDept,
    severity: 'minor',
    description: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetch('http://localhost:8080/api/machines')
        .then(res => res.json())
        .then(data => {
          setMachines(data || []);
          if (!editingDefect && data && data.length > 0) {
            setFormData(prev => ({ ...prev, machine_id: data[0].id }));
          }
        })
        .catch(err => console.error("Failed to fetch machines", err));

      if (editingDefect) {
        setFormData({
          machine_id: editingDefect.machine_id,
          source_department: editingDefect.source_department,
          assigned_department: editingDefect.assigned_department || defaultAssignedDept,
          severity: editingDefect.severity,
          description: editingDefect.description
        });
      } else {
        setFormData({
          machine_id: machines.length > 0 ? machines[0].id : '',
          source_department: defaultAssignedDept,
          assigned_department: defaultAssignedDept,
          severity: 'minor',
          description: ''
        });
      }
    }
  }, [isOpen, editingDefect, defaultAssignedDept]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDefect) {
        await fetch(`http://localhost:8080/api/defects/${editingDefect.id}/edit`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        await fetch(`http://localhost:8080/api/machines/${formData.machine_id}/defects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save defect", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: 'var(--vtr-theme-primary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '1.5rem', borderBottom: '1px solid var(--vtr-theme-primary)', paddingBottom: '0.5rem' }}>
          {editingDefect ? 'Edit Issue' : 'Log New Issue'}
        </h2>
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MACHINE / ORDER NUMBER</label>
            <select 
              value={formData.machine_id} 
              onChange={e => setFormData({...formData, machine_id: e.target.value})}
              required
              disabled={!!editingDefect} 
              className="vtr-input"
            >
              <option value="" disabled>Select a machine...</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.order_number}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SOURCE DEPT</label>
              <select 
                value={formData.source_department} 
                onChange={e => setFormData({...formData, source_department: e.target.value})}
                className="vtr-input"
              >
                <option value="quality">Quality</option>
                <option value="design">Design</option>
                <option value="kitting">Kitting</option>
                <option value="assembly">Assembly</option>
                <option value="machine_shop">Machine Shop</option>
                <option value="electrical_controls">Electrical / Controls</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ASSIGNED / ROUTING</label>
              <select 
                value={formData.assigned_department} 
                onChange={e => setFormData({...formData, assigned_department: e.target.value})}
                className="vtr-input"
                style={{ borderColor: 'var(--vtr-theme-primary)', color: 'var(--vtr-theme-primary)' }}
              >
                <option value="quality">Quality</option>
                <option value="design">Design (ECR)</option>
                <option value="kitting">Kitting</option>
                <option value="assembly">Assembly</option>
                <option value="machine_shop">Machine Shop</option>
                <option value="electrical_controls">Electrical / Controls</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SEVERITY</label>
            <select 
              value={formData.severity} 
              onChange={e => setFormData({...formData, severity: e.target.value})}
              className="vtr-input"
            >
              <option value="critical">Critical (Blocker)</option>
              <option value="major">Major (Needs Fix)</option>
              <option value="minor">Minor (Tweak)</option>
              <option value="info">Info / Note</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DESCRIPTION</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})}
              required
              rows={4}
              className="vtr-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="vtr-btn" style={{ flex: 1 }}>{editingDefect ? 'SAVE CHANGES' : 'CREATE ISSUE'}</button>
            <button type="button" className="vtr-btn vtr-btn-secondary" onClick={onClose}>CANCEL</button>
          </div>
        </form>
      </div>
    </div>
  );
}
