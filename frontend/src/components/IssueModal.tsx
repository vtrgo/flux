"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { ACTIVE_DEPARTMENTS, formatDepartmentName } from "../lib/departments";
import styles from "../app/(main)/quality/quality.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";

import { Machine, Defect } from "../types";

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDefect: Defect | null;
  defaultAssignedDept?: string;
  preselectedMachineId?: string;
}

import { ImageUploader } from "./ImageUploader";
import { AttachmentViewer } from "./AttachmentViewer";

export function IssueModal({ isOpen, onClose, editingDefect, defaultAssignedDept = 'quality', preselectedMachineId }: IssueModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [uploadCount, setUploadCount] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const defaultRoutedDept = defaultAssignedDept === 'quality' ? '' : defaultAssignedDept;

  const [formData, setFormData] = useState({
    machine_id: '',
    source_department: defaultAssignedDept,
    assigned_department: defaultRoutedDept,
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
          if (!editingDefect && data && data.length > 0 && !preselectedMachineId) {
            setFormData(prev => ({ ...prev, machine_id: data[0].id }));
          }
        })
        .catch(err => console.error("Failed to fetch machines", err));

      if (editingDefect) {
        setFormData({
          machine_id: editingDefect.machine_id,
          source_department: editingDefect.source_department,
          assigned_department: editingDefect.assigned_department || defaultRoutedDept,
          severity: editingDefect.severity,
          description: editingDefect.description,
          notes: editingDefect.notes || ''
        });
      } else {
        setFormData({
          machine_id: preselectedMachineId || '',
          source_department: defaultAssignedDept,
          assigned_department: defaultRoutedDept,
          severity: 'moderate',
          description: '',
          notes: ''
        });
      }
    }
  }, [isOpen, editingDefect, defaultAssignedDept, defaultRoutedDept, preselectedMachineId]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingDefect) {
        await fetchApi(`defects/${editingDefect.id}/edit`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        toast.success('Changes saved successfully!');
      } else {
        const newDefect = await fetchApi<Defect>(`machines/${formData.machine_id}/defects`, {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        
        if (newDefect && pendingFiles.length > 0) {
          const toastId = toast.loading(`Uploading ${pendingFiles.length} image(s)...`);
          try {
            for (const file of pendingFiles) {
              const fd = new FormData();
              fd.append("file", file);
              await fetchApi(`issues/${newDefect.id}/attachments`, {
                method: "POST",
                body: fd,
              });
            }
            toast.success('Issue and images saved successfully!', { id: toastId });
          } catch (uploadErr) {
            console.error("Upload error", uploadErr);
            toast.error('Issue created, but failed to upload some images', { id: toastId });
          }
        } else {
          toast.success('Issue saved successfully!');
        }
      }
      
      setPendingFiles([]);
      onClose();
    } catch (err) {
      console.error("Failed to save defect", err);
      toast.error('Failed to save issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Smart form submission
  useAppHotkeys('ctrl+enter, meta+enter', () => {
    if (isOpen) {
      const submitEvent = { preventDefault: () => {} } as React.FormEvent;
      handleFormSubmit(submitEvent);
    }
  }, { enableOnFormTags: true }, [isOpen, formData, editingDefect]);

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
              {machines.map(m => <option key={m.id} value={m.id}>{m.order_number} - {m.model_type}</option>)}
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
                required
                className="vtr-input"
                style={{ borderColor: 'var(--vtr-theme-primary)', color: 'var(--vtr-theme-primary)' }}
              >
                <option value="" disabled>Select Department...</option>
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

          {editingDefect ? (
            <>
              <AttachmentViewer key={uploadCount} issueId={editingDefect.id} editable={true} />
              <ImageUploader issueId={editingDefect.id} onUploadComplete={() => setUploadCount(prev => prev + 1)} />
            </>
          ) : (
            <div style={{ marginTop: "0.5rem" }}>
              <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--vtr-theme-primary)", marginBottom: "0.5rem", textTransform: 'uppercase' }}>ATTACHMENTS (PENDING)</h3>
              
              {pendingFiles.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  {pendingFiles.map((f, i) => (
                    <div key={i} style={{ border: "1px solid var(--border-color)", padding: "0.25rem", borderRadius: "4px", position: "relative" }}>
                      <button 
                        type="button"
                        style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: '50%', width: '1.5rem', height: '1.5rem', cursor: 'pointer', zIndex: 10 }}
                        onClick={() => setPendingFiles(prev => prev.filter((_, index) => index !== i))}
                      >
                        &times;
                      </button>
                      <img src={URL.createObjectURL(f)} alt="Pending upload preview" style={{ width: "80px", height: "80px", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              )}

              <input 
                type="file" 
                accept="image/*"
                capture="environment"
                multiple
                id="new-issue-upload"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) {
                    setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
              <label htmlFor="new-issue-upload" className="vtr-btn vtr-btn-secondary" style={{ cursor: "pointer", display: "inline-block", fontSize: "0.75rem" }}>
                + ADD PHOTO
              </label>
            </div>
          )}


          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="vtr-btn" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'SAVING...' : (editingDefect ? 'SAVE CHANGES' : 'CREATE ISSUE')}
            </button>
            <button type="button" className="vtr-btn vtr-btn-secondary" onClick={onClose} disabled={isSubmitting}>CANCEL</button>
          </div>
        </form>
      </div>
    </div>
  );
}
