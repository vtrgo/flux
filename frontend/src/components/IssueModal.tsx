"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { ACTIVE_DEPARTMENTS, formatDepartmentName } from "../lib/departments";
import styles from "../app/quality/quality.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";

import { Machine, Defect } from "../types";

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDefect: Defect | null;
  defaultAssignedDept?: string;
  preselectedMachineId?: string;
}

export function IssueModal({ isOpen, onClose, editingDefect, defaultAssignedDept = 'quality', preselectedMachineId }: IssueModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [formData, setFormData] = useState({
    machine_id: '',
    source_department: defaultAssignedDept,
    assigned_department: defaultAssignedDept,
    severity: 'moderate',
    description: '',
    notes: ''
  });

  useAppHotkeys('escape', () => {
    if (isOpen) {
      onClose();
    }
  }, { enableOnFormTags: true }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      fetchApi<Machine[]>('machines')
        .then(data => {
          setMachines(data || []);
          if (!editingDefect && data && data.length > 0) {
            setFormData(prev => ({ ...prev, machine_id: preselectedMachineId || data[0].id }));
          }
        })
        .catch(err => console.error("Failed to fetch machines", err));

      if (editingDefect) {
        setFormData({
          machine_id: editingDefect.machine_id,
          source_department: editingDefect.source_department,
          assigned_department: editingDefect.assigned_department || defaultAssignedDept,
          severity: editingDefect.severity,
          description: editingDefect.description,
          notes: editingDefect.notes || ''
        });
      } else {
        setFormData({
          machine_id: preselectedMachineId || '',
          source_department: defaultAssignedDept,
          assigned_department: defaultAssignedDept,
          severity: 'moderate',
          description: '',
          notes: ''
        });
      }
    }
  }, [isOpen, editingDefect, defaultAssignedDept, preselectedMachineId]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDefect) {
        await fetchApi(`defects/${editingDefect.id}/edit`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi(`machines/${formData.machine_id}/defects`, {
          method: 'POST',
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
                {ACTIVE_DEPARTMENTS.map(d => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
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
                {ACTIVE_DEPARTMENTS.map(d => (
                  <option key={d.key} value={d.key}>{d.key === 'design' ? 'Design (ECR)' : d.label}</option>
                ))}
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
              <option value="critical">Critical</option>
              <option value="moderate">Moderate</option>
              <option value="minor">Minor</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DESCRIPTION</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})}
              required
              autoFocus
              rows={4}
              className="vtr-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>NOTES (OPTIONAL)</label>
            <textarea 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={3}
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
