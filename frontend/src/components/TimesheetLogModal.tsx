"use client";

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../lib/api';
import { Machine, ProjectTask, ReworkItem, Defect, TimeEntryType, CreateTimeEntryRequest } from '../types';
import styles from './TimesheetLogModal.module.css';

interface TimesheetLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultMachineId?: string;
  defaultEntryType?: TimeEntryType;
  defaultTaskId?: string;
  defaultReworkId?: string;
  defaultDefectId?: string;
}

export function TimesheetLogModal({
  isOpen,
  onClose,
  onSuccess,
  defaultMachineId,
  defaultEntryType = 'production',
  defaultTaskId,
  defaultReworkId,
  defaultDefectId,
}: TimesheetLogModalProps) {
  const [entryType, setEntryType] = useState<TimeEntryType>(defaultEntryType);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(defaultMachineId || '');
  
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(defaultTaskId || '');

  const [reworkItems, setReworkItems] = useState<ReworkItem[]>([]);
  const [selectedReworkId, setSelectedReworkId] = useState<string>(defaultReworkId || '');

  const [defects, setDefects] = useState<Defect[]>([]);
  const [selectedDefectId, setSelectedDefectId] = useState<string>(defaultDefectId || '');

  const [workDate, setWorkDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [hoursSpent, setHoursSpent] = useState<string>('1.0');
  const [workDescription, setWorkDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Load machines
  useEffect(() => {
    if (!isOpen) return;
    fetchApi<Machine[]>('machines')
      .then(data => {
        setMachines(data || []);
        if (!selectedMachineId && data && data.length > 0) {
          setSelectedMachineId(data[0].id);
        }
      })
      .catch(err => console.error('Failed to load machines', err));
  }, [isOpen, selectedMachineId]);

  // Load tasks for machine
  useEffect(() => {
    if (!selectedMachineId || !isOpen) {
      setTasks([]);
      return;
    }
    fetchApi<ProjectTask[]>(`machines/${selectedMachineId}/tasks`)
      .then(data => {
        setTasks(data || []);
        if (data && data.length > 0 && !selectedTaskId) {
          setSelectedTaskId(data[0].id);
        }
      })
      .catch(err => console.error('Failed to load tasks', err));
  }, [selectedMachineId, isOpen, selectedTaskId]);

  // Load rework items if rework tab is selected
  useEffect(() => {
    if (entryType !== 'rework' || !selectedMachineId || !isOpen) return;
    fetchApi<ReworkItem[]>(`rework/items?machine_id=${selectedMachineId}`)
      .then(data => {
        setReworkItems(data || []);
        if (data && data.length > 0 && !selectedReworkId) {
          setSelectedReworkId(data[0].id);
        }
      })
      .catch(err => console.error('Failed to load rework items', err));
  }, [entryType, selectedMachineId, isOpen, selectedReworkId]);

  // Load defects if issue_fix tab is selected
  useEffect(() => {
    if (entryType !== 'issue_fix' || !selectedMachineId || !isOpen) return;
    fetchApi<Defect[]>(`machines/${selectedMachineId}/defects`)
      .then(data => {
        setDefects(data || []);
        if (data && data.length > 0 && !selectedDefectId) {
          setSelectedDefectId(data[0].id);
        }
      })
      .catch(err => console.error('Failed to load defects', err));
  }, [entryType, selectedMachineId, isOpen, selectedDefectId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = parseFloat(hoursSpent);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      toast.error('Please enter valid hours between 0.25 and 24');
      return;
    }

    if (entryType === 'production' && !selectedTaskId) {
      toast.error('Please select a production task');
      return;
    }
    if (entryType === 'rework' && !selectedReworkId) {
      toast.error('Please select a rework traveler');
      return;
    }
    if (entryType === 'issue_fix' && !selectedDefectId) {
      toast.error('Please select an issue/defect');
      return;
    }

    try {
      setSubmitting(true);
      const payload: CreateTimeEntryRequest = {
        machine_id: selectedMachineId || undefined,
        entry_type: entryType,
        work_date: workDate,
        hours_spent: hours,
        work_description: workDescription.trim(),
      };

      if (entryType === 'production') payload.project_task_id = selectedTaskId;
      if (entryType === 'rework') payload.rework_item_id = selectedReworkId;
      if (entryType === 'issue_fix') payload.defect_id = selectedDefectId;

      await fetchApi('time-entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success(`Logged ${hours}h successfully!`);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record time entry';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <span style={{ fontSize: '1.4rem' }}>⏱️</span>
            <h2 className={styles.title}>Log Shop Floor Time</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close modal">×</button>
        </div>

        {/* Universal Activity Navigation */}
        <div className={styles.categoryNav}>
          <button
            type="button"
            className={`${styles.categoryTab} ${entryType === 'production' ? styles.categoryTabActive : ''}`}
            onClick={() => setEntryType('production')}
          >
            ⚙️ Production Task
          </button>
          <button
            type="button"
            className={`${styles.categoryTab} ${entryType === 'rework' ? styles.categoryTabActive : ''}`}
            onClick={() => setEntryType('rework')}
          >
            🔄 Rework (SOP 1-003)
          </button>
          <button
            type="button"
            className={`${styles.categoryTab} ${entryType === 'issue_fix' ? styles.categoryTabActive : ''}`}
            onClick={() => setEntryType('issue_fix')}
          >
            ⚠️ Issue / NCR Fix
          </button>
          <button
            type="button"
            className={`${styles.categoryTab} ${entryType === 'indirect' ? styles.categoryTabActive : ''}`}
            onClick={() => setEntryType('indirect')}
          >
            🧹 Shop Indirect
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.body}>
          {/* Machine Selection (unless indirect) */}
          {entryType !== 'indirect' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Target Machine / Order *</label>
              <select
                className={styles.select}
                value={selectedMachineId}
                onChange={e => {
                  setSelectedMachineId(e.target.value);
                  setSelectedTaskId('');
                  setSelectedReworkId('');
                  setSelectedDefectId('');
                }}
                required
              >
                <option value="">Select a Machine...</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.order_number} ({m.model_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contextual Target Selector */}
          {entryType === 'production' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Production Task *</label>
              <select
                className={styles.select}
                value={selectedTaskId}
                onChange={e => setSelectedTaskId(e.target.value)}
                required
              >
                <option value="">Select Quoted Task...</option>
                {Object.entries(
                  tasks.reduce((acc, t) => {
                    const dept = t.department || 'general';
                    if (!acc[dept]) acc[dept] = [];
                    acc[dept].push(t);
                    return acc;
                  }, {} as Record<string, ProjectTask[]>)
                ).map(([dept, deptTasks]) => (
                  <optgroup key={dept} label={dept.toUpperCase()}>
                    {deptTasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.task_name} — Quoted: {t.quoted_hours}h | Actual: {t.actual_hours}h
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {entryType === 'rework' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Rework Traveler (SOP 1-003) *</label>
              <select
                className={styles.select}
                value={selectedReworkId}
                onChange={e => setSelectedReworkId(e.target.value)}
                required
              >
                <option value="">Select Rework Traveler...</option>
                {reworkItems.map(rw => (
                  <option key={rw.id} value={rw.id}>
                    [{rw.part_type}] {rw.part_number} - {rw.description} (Est: {rw.estimated_hours || 0}h)
                  </option>
                ))}
              </select>
            </div>
          )}

          {entryType === 'issue_fix' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Defect / Non-Conformance *</label>
              <select
                className={styles.select}
                value={selectedDefectId}
                onChange={e => setSelectedDefectId(e.target.value)}
                required
              >
                <option value="">Select Issue to Repair...</option>
                {defects.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.is_ncr ? `[NCR ${d.ncr_number}]` : '[DEFECT]'} {d.description} ({d.assigned_department})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.grid2}>
            {/* Work Date */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Date *</label>
              <input
                type="date"
                className={styles.input}
                value={workDate}
                onChange={e => setWorkDate(e.target.value)}
                required
              />
            </div>

            {/* Hours Spent */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Hours Spent *</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                className={styles.input}
                value={hoursSpent}
                onChange={e => setHoursSpent(e.target.value)}
                required
              />
              <div className={styles.hoursSelector}>
                {['0.5', '1.0', '2.0', '4.0', '8.0'].map(val => (
                  <button
                    key={val}
                    type="button"
                    className={styles.hourPill}
                    onClick={() => setHoursSpent(val)}
                  >
                    +{val}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Work Description */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Work Notes / Operations Performed</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="e.g. Assembled main drive shaft, torqued fasteners to spec, wired encoder..."
              value={workDescription}
              onChange={e => setWorkDescription(e.target.value)}
            />
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className="vtr-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="vtr-btn vtr-btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Recording...' : 'Record Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
