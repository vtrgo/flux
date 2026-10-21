"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { ACTIVE_DEPARTMENTS, formatDepartmentName } from "../lib/departments";
import styles from "./IssueModal.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";

import { Machine, Defect } from "../types";
import { toCalendarDateInput, calendarDateToUtcNoon } from "../lib/dateUtils";

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDefect: Defect | null;
  defaultAssignedDept?: string;
  preselectedMachineId?: string;
}

import { ImageUploader } from "./ImageUploader";
import { AttachmentViewer } from "./AttachmentViewer";
import { useUsers } from "../hooks/useUsers";
import { NotificationRoutingCheckbox } from "./NotificationRoutingCheckbox";
import { Authorize } from "./Authorize";
import { NCRModal } from "./NCRModal";
import { ReworkModal } from "./ReworkModal";

export function IssueModal({ isOpen, onClose, editingDefect, defaultAssignedDept = 'quality', preselectedMachineId }: IssueModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [uploadCount, setUploadCount] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNCRModalOpen, setIsNCRModalOpen] = useState(false);
  const [isReworkModalOpen, setIsReworkModalOpen] = useState(false);
  const defaultRoutedDept = defaultAssignedDept === 'quality' ? '' : defaultAssignedDept;
  const { users } = useUsers();
  const [sendNotification, setSendNotification] = useState(false);

  const [formData, setFormData] = useState({
    machine_id: '',
    source_department: defaultAssignedDept,
    assigned_department: defaultRoutedDept,
    assigned_user_id: '',
    severity: 'moderate',
    description: '',
    notes: '',
    due_date: '',
    label: 'Defect'
  });

  useAppHotkeys('escape', () => {
    if (isOpen && !isNCRModalOpen && !isReworkModalOpen) {
      onClose();
    }
  }, { enableOnFormTags: true }, [isOpen, isNCRModalOpen, isReworkModalOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsNCRModalOpen(false);
      setIsReworkModalOpen(false);
    }
  }, [isOpen]);

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
        setSendNotification(false);
        setFormData({
          machine_id: editingDefect.machine_id,
          source_department: editingDefect.source_department,
          assigned_department: editingDefect.assigned_department || defaultRoutedDept,
          assigned_user_id: editingDefect.assigned_user_id || '',
          severity: editingDefect.severity,
          description: editingDefect.description,
          notes: editingDefect.notes || '',
          due_date: toCalendarDateInput(editingDefect.due_date),
          label: editingDefect.label || 'Defect'
        });
      } else {
        setSendNotification(false);
        setFormData({
          machine_id: preselectedMachineId || '',
          source_department: defaultAssignedDept,
          assigned_department: defaultRoutedDept,
          assigned_user_id: '',
          severity: 'moderate',
          description: '',
          notes: '',
          due_date: '',
          label: 'Defect'
        });
      }
    }
  }, [isOpen, editingDefect, defaultAssignedDept, defaultRoutedDept, preselectedMachineId]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const finalAssignedDept = formData.label === 'General' && !formData.assigned_department
      ? formData.source_department
      : formData.assigned_department;

    const payload = {
      ...formData,
      assigned_department: finalAssignedDept,
      due_date: formData.due_date ? calendarDateToUtcNoon(formData.due_date) : undefined,
      send_notification: !editingDefect && formData.label !== 'General' ? sendNotification : undefined
    };
    try {
      if (editingDefect) {
        await fetchApi(`defects/${editingDefect.id}/edit`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        toast.success('Changes saved successfully!');
      } else {
        const newDefect = await fetchApi<Defect>(`machines/${formData.machine_id}/defects`, {
          method: 'POST',
          body: JSON.stringify(payload)
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
    if (isOpen && !isNCRModalOpen) {
      const submitEvent = { preventDefault: () => {} } as React.FormEvent;
      handleFormSubmit(submitEvent);
    }
  }, { enableOnFormTags: true }, [isOpen, isNCRModalOpen, formData, editingDefect]);

  const assignedUser = users.find(u => u.id === formData.assigned_user_id);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className={styles.modalOverlay} 
        onClick={onClose}
        style={{ display: isNCRModalOpen ? 'none' : undefined }}
      >
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <form onSubmit={handleFormSubmit} className={styles.modalForm}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingDefect ? 'Edit Issue' : 'Log New Issue'}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close modal"
                title="Close (Esc)"
              >
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ISSUE CLASSIFICATION
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, label: 'Defect' }))}
                    className="vtr-btn"
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      border: formData.label === 'General' ? '1px solid var(--border-color)' : '1px solid var(--vtr-theme-primary)',
                      background: formData.label === 'General' ? 'transparent' : 'rgba(0, 229, 255, 0.12)',
                      color: formData.label === 'General' ? 'var(--text-secondary)' : 'var(--vtr-theme-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    ACTIONABLE DEFECT
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, label: 'General', severity: prev.severity === 'critical' ? 'minor' : prev.severity }))}
                    className="vtr-btn"
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      border: formData.label === 'General' ? '1px solid #64b5f6' : '1px solid var(--border-color)',
                      background: formData.label === 'General' ? 'rgba(100, 181, 246, 0.15)' : 'transparent',
                      color: formData.label === 'General' ? '#64b5f6' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    GENERAL ISSUE (CLOSED)
                  </button>
                </div>
                {formData.label === 'General' && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#90caf9',
                    background: 'rgba(30, 58, 138, 0.25)',
                    border: '1px solid rgba(144, 202, 249, 0.3)',
                    borderRadius: '4px',
                    padding: '0.5rem 0.75rem',
                    marginTop: '0.25rem',
                    lineHeight: '1.4'
                  }}>
                    ℹ️ <strong>Informational Record:</strong> This issue will automatically exist as closed with a generic &quot;General&quot; label. Useful for capturing details across projects without creating pending tasks or blocking machine readiness.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label htmlFor="issue_machine_id" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MACHINE / ORDER NUMBER</label>
            <select 
              id="issue_machine_id"
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
          
          <div className={styles.routingGrid}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label htmlFor="issue_source_department" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SOURCE DEPT</label>
              <select 
                id="issue_source_department"
                value={formData.source_department} 
                onChange={e => setFormData({...formData, source_department: e.target.value})}
                className="vtr-input"
              >
                {ACTIVE_DEPARTMENTS.map(d => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label htmlFor="assigned_department" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ASSIGNED / ROUTING</label>
              <select 
                id="assigned_department"
                value={formData.assigned_department} 
                onChange={e => {
                  const newDept = e.target.value;
                  // If switching department, reset assignee if currently assigned user is not in the new department
                  const currentUser = users.find(u => u.id === formData.assigned_user_id);
                  const userDept = (currentUser?.department || '').toLowerCase();
                  const isQualityMatch = (newDept.toLowerCase() === 'quality' || newDept.toLowerCase() === 'quality_pm') && 
                    (userDept === 'quality' || userDept === 'project_management' || userDept === 'pm' || userDept === 'quality_pm');
                  const isUserInNewDept = currentUser && (userDept === newDept.toLowerCase() || isQualityMatch);
                  setFormData({
                    ...formData,
                    assigned_department: newDept,
                    assigned_user_id: isUserInNewDept ? formData.assigned_user_id : ''
                  });
                }}
                required={formData.label !== 'General'}
                className="vtr-input"
                style={{ borderColor: 'var(--vtr-theme-primary)', color: 'var(--vtr-theme-primary)' }}
              >
                <option value="" disabled>Select Department...</option>
                {ACTIVE_DEPARTMENTS.map(d => (
                  <option key={d.key} value={d.key}>{d.key === 'design' ? 'Design (ECR)' : d.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label htmlFor="assigned_user_id" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ASSIGNEE</label>
              <select 
                id="assigned_user_id"
                value={formData.assigned_user_id} 
                onChange={e => setFormData({...formData, assigned_user_id: e.target.value})}
                className="vtr-input"
                disabled={!formData.assigned_department}
              >
                <option value="">
                  {!formData.assigned_department ? 'Select routing department first' : 'Unassigned'}
                </option>
                {users
                  .filter(u => {
                    if (!formData.assigned_department) return false;
                    const userDept = (u.department || '').toLowerCase();
                    const assignedDept = formData.assigned_department.toLowerCase();
                    if (assignedDept === 'quality' || assignedDept === 'quality_pm') {
                      return userDept === 'quality' || userDept === 'project_management' || userDept === 'pm' || userDept === 'quality_pm';
                    }
                    return userDept === assignedDept;
                  })
                  .sort((a, b) => a.username.localeCompare(b.username))
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className={styles.severityGrid}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label htmlFor="issue_severity" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SEVERITY</label>
              <select 
                id="issue_severity"
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
              <label htmlFor="issue_due_date" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TARGET RESOLUTION DATE (OPTIONAL)</label>
              <input 
                id="issue_due_date"
                type="date"
                value={formData.due_date}
                onChange={e => setFormData({...formData, due_date: e.target.value})}
                className="vtr-input"
              />
            </div>
          </div>

          {!editingDefect && formData.label !== 'General' && (
            <NotificationRoutingCheckbox
              checked={sendNotification}
              onChange={setSendNotification}
              assignedUser={assignedUser}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="issue_description" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                BRIEF DESCRIPTION
              </label>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: formData.description.length >= 240 ? 'var(--accent-red, #ff3366)' : 'var(--text-secondary)' }}>
                {formData.description.length}/255
              </span>
            </div>
            <textarea 
              id="issue_description"
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})}
              required
              maxLength={255}
              autoFocus
              rows={2}
              placeholder="Brief summary of the issue (e.g. Bolt loose on station 3)"
              className="vtr-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label htmlFor="issue_notes" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              DETAILED NOTES & CONTEXT (OPTIONAL)
            </label>
            <textarea 
              id="issue_notes"
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={5}
              placeholder="Add detailed troubleshooting steps, root cause context, rework instructions, or specifications as needed..."
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


            </div>

            <div className={styles.modalFooter}>
              <div className={styles.footerLeft}>
                <Authorize roles={['admin', 'manager']}>
                  {editingDefect && !editingDefect.is_ncr && (
                    <button
                      type="button"
                      className="vtr-btn"
                      onClick={() => setIsNCRModalOpen(true)}
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        color: "var(--accent-red, #ff3366)",
                        borderColor: "var(--accent-red, #ff3366)",
                      }}
                      title="Upgrade this issue into a formal Non-Conformance Report"
                    >
                      UPGRADE TO NCR
                    </button>
                  )}
                </Authorize>
                <Authorize roles={['admin', 'manager', 'lead', 'supervisor']}>
                  {editingDefect && (
                    <button
                      type="button"
                      className="vtr-btn"
                      onClick={() => setIsReworkModalOpen(true)}
                      style={{
                        backgroundColor: "rgba(255, 112, 67, 0.15)",
                        color: "#ff7043",
                        borderColor: "#ff7043",
                      }}
                      title="Escalate this issue into an active SOP 1-003 Rework Traveler"
                    >
                      ESCALATE TO REWORK
                    </button>
                  )}
                </Authorize>
              </div>
              <div className={styles.footerRight}>
                <button
                  type="button"
                  className="vtr-btn vtr-btn-secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="vtr-btn vtr-btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'SAVING...' : (editingDefect ? 'SAVE CHANGES' : 'CREATE ISSUE')}
                </button>
              </div>
            </div>
          </form>
      </div>
    </div>

    {editingDefect && isNCRModalOpen && (
      <NCRModal
        isOpen={isNCRModalOpen}
        onClose={() => setIsNCRModalOpen(false)}
        upgradeFromDefect={editingDefect}
        onSaved={() => {
          setIsNCRModalOpen(false);
          onClose();
        }}
      />
    )}

    {editingDefect && isReworkModalOpen && (
      <ReworkModal
        isOpen={isReworkModalOpen}
        onClose={() => setIsReworkModalOpen(false)}
        preselectedDefectId={editingDefect.id}
        preselectedMachineId={editingDefect.machine_id}
        initialDefect={editingDefect}
        onSaved={() => {
          setIsReworkModalOpen(false);
          toast.success("Rework traveler created and linked to issue");
          onClose();
        }}
      />
    )}
  </>
  );
}
