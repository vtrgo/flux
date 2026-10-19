"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../lib/api';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { getMondayOfWeek, addWeeks, getWeekDays, formatWeekRange } from '../lib/dateUtils';
import {
  Machine,
  DepartmentTask,
  ProjectTask,
  TimeEntryType,
  WeeklyTimesheetSaveItem,
} from '../types';
import styles from './WeeklyTimesheetGrid.module.css';

interface WeeklyTimesheetGridProps {
  machines: Machine[];
  departmentTasks: DepartmentTask[];
  initialWeekStart?: string;
  readOnlyUserView?: boolean;
}

interface GridRow {
  rowKey: string;
  machine_id?: string;
  order_number?: string;
  project_task_id?: string;
  task_name: string;
  department?: string;
  entry_type: TimeEntryType;
  days: Record<string, number>; // dateStr -> hours
  descriptions: Record<string, string>; // dateStr -> description
}

const INDIRECT_TASKS = [
  'General Shop Maintenance',
  'Safety / 5S Cleaning',
  'Team Meeting / Training',
  'Tooling & Equipment Care',
  'Material Handling & Staging',
  'Shop Floor Support',
];

export function WeeklyTimesheetGrid({
  machines,
  departmentTasks,
  initialWeekStart,
  readOnlyUserView = false,
}: WeeklyTimesheetGridProps) {
  const [currentWeekMonday, setCurrentWeekMonday] = useState<string>(() =>
    initialWeekStart ? getMondayOfWeek(initialWeekStart) : getMondayOfWeek()
  );

  const {
    weeklyTimesheet,
    loading,
    fetchWeeklyTimesheet,
    saveWeeklyTimesheet,
    submitWeeklyTimesheet,
    withdrawWeeklyTimesheet,
  } = useTimesheetData();

  const [rows, setRows] = useState<GridRow[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Add row bar state
  const [showAddRow, setShowAddRow] = useState<boolean>(false);
  const [newRowMachineId, setNewRowMachineId] = useState<string>('');
  const [newRowTaskIdentifier, setNewRowTaskIdentifier] = useState<string>('');
  const [newRowEntryType, setNewRowEntryType] = useState<TimeEntryType>('production');

  // Machine-specific allocated tasks quoted by team lead
  const [machineTasks, setMachineTasks] = useState<ProjectTask[]>([]);
  const [loadingMachineTasks, setLoadingMachineTasks] = useState<boolean>(false);

  const weekDays = useMemo(() => getWeekDays(currentWeekMonday), [currentWeekMonday]);
  const isCurrentWeek = useMemo(() => getMondayOfWeek() === currentWeekMonday, [currentWeekMonday]);

  // Load weekly timesheet whenever the selected week changes
  useEffect(() => {
    fetchWeeklyTimesheet(currentWeekMonday);
  }, [currentWeekMonday, fetchWeeklyTimesheet]);

  // Fetch machine allocated tasks when a machine is selected in Add Row
  useEffect(() => {
    if (!newRowMachineId) {
      setMachineTasks([]);
      setNewRowTaskIdentifier(INDIRECT_TASKS[0]);
      return;
    }
    setLoadingMachineTasks(true);
    fetchApi<ProjectTask[]>(`machines/${newRowMachineId}/tasks`)
      .then(tasks => {
        setMachineTasks(tasks || []);
        if (tasks && tasks.length > 0) {
          setNewRowTaskIdentifier(`task:${tasks[0].id}`);
        } else {
          setNewRowTaskIdentifier('');
        }
      })
      .catch(err => {
        console.error('Failed to load tasks for machine', err);
        setMachineTasks([]);
      })
      .finally(() => setLoadingMachineTasks(false));
  }, [newRowMachineId]);

  // Sync state when weeklyTimesheet loads
  useEffect(() => {
    if (!weeklyTimesheet || Array.isArray(weeklyTimesheet)) {
      setRows([]);
      setNotes('');
      setIsDirty(false);
      return;
    }

    setNotes(weeklyTimesheet.notes || '');

    // Transform entries into matrix rows
    const rowMap = new Map<string, GridRow>();
    const entries = Array.isArray(weeklyTimesheet.entries) ? weeklyTimesheet.entries : [];

    entries.forEach(entry => {
      const machineKey = entry.machine_id || 'none';
      const taskKey = entry.project_task_id || entry.task_name || 'general';
      const typeKey = entry.entry_type || 'production';
      const rowKey = `${machineKey}:${taskKey}:${typeKey}`;

      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          rowKey,
          machine_id: entry.machine_id,
          order_number: entry.order_number || (entry.machine_id ? machines.find(m => m.id === entry.machine_id)?.order_number : undefined),
          project_task_id: entry.project_task_id,
          task_name: entry.task_name || 'General Task',
          department: entry.department,
          entry_type: entry.entry_type,
          days: {},
          descriptions: {},
        });
      }

      const row = rowMap.get(rowKey)!;
      row.days[entry.work_date] = (row.days[entry.work_date] || 0) + entry.hours_spent;
      if (entry.work_description) {
        row.descriptions[entry.work_date] = entry.work_description;
      }
    });

    setRows(Array.from(rowMap.values()));
    setIsDirty(false);
  }, [weeklyTimesheet, machines]);

  const isLocked = useMemo(() => {
    if (readOnlyUserView) return true;
    if (!weeklyTimesheet) return false;
    return weeklyTimesheet.status === 'submitted' || weeklyTimesheet.status === 'approved';
  }, [weeklyTimesheet, readOnlyUserView]);

  // Handlers for week navigation
  const handlePrevWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekMonday(prev => addWeeks(prev, -1));
  };

  const handleNextWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekMonday(prev => addWeeks(prev, 1));
  };

  const handleThisWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekMonday(getMondayOfWeek());
  };

  // Cell change handler
  const handleCellChange = (rowKey: string, dateStr: string, valueStr: string) => {
    if (isLocked) return;
    const hours = valueStr === '' ? 0 : parseFloat(valueStr);
    if (isNaN(hours) || hours < 0 || hours > 24) return;

    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        const newDays = { ...r.days };
        if (hours === 0) {
          delete newDays[dateStr];
        } else {
          newDays[dateStr] = hours;
        }
        return { ...r, days: newDays };
      })
    );
    setIsDirty(true);
  };

  // Add row handler
  const handleAddRow = () => {
    if (isLocked) return;
    let selectedMachine: Machine | undefined;
    if (newRowMachineId) {
      selectedMachine = machines.find(m => m.id === newRowMachineId);
    }

    let projectTaskId: string | undefined;
    let taskName = 'General Labor';
    let department = 'assembly';

    if (!newRowMachineId) {
      taskName = newRowTaskIdentifier || INDIRECT_TASKS[0];
      department = 'shop';
    } else if (newRowTaskIdentifier.startsWith('task:')) {
      const taskId = newRowTaskIdentifier.replace('task:', '');
      const found = machineTasks.find(t => t.id === taskId);
      if (found) {
        projectTaskId = found.id;
        taskName = found.task_name;
        department = found.department;
      }
    } else if (newRowTaskIdentifier.startsWith('dept:')) {
      const code = newRowTaskIdentifier.replace('dept:', '');
      const found = departmentTasks.find(t => t.task_code === code);
      if (found) {
        taskName = found.task_name;
        department = found.department;
      }
    } else if (newRowTaskIdentifier) {
      taskName = newRowTaskIdentifier;
    }

    const rowKey = `${newRowMachineId || 'none'}:${projectTaskId || taskName}:${newRowEntryType}-${Date.now()}`;

    const newRow: GridRow = {
      rowKey,
      machine_id: newRowMachineId || undefined,
      order_number: selectedMachine?.order_number,
      project_task_id: projectTaskId,
      task_name: taskName,
      department,
      entry_type: newRowEntryType,
      days: {},
      descriptions: {},
    };

    setRows(prev => [...prev, newRow]);
    setIsDirty(true);
    setShowAddRow(false);
    setNewRowTaskIdentifier('');
  };

  // Remove row handler
  const handleRemoveRow = (rowKey: string) => {
    if (isLocked) return;
    setRows(prev => prev.filter(r => r.rowKey !== rowKey));
    setIsDirty(true);
  };

  // Build payload
  const buildSavePayload = useCallback((): WeeklyTimesheetSaveItem[] => {
    const items: WeeklyTimesheetSaveItem[] = [];
    rows.forEach(row => {
      Object.entries(row.days).forEach(([dateStr, hours]) => {
        if (hours > 0) {
          items.push({
            machine_id: row.machine_id,
            entry_type: row.entry_type,
            project_task_id: row.project_task_id,
            department: row.department,
            work_date: dateStr,
            hours_spent: hours,
            work_description: row.descriptions[dateStr] || row.task_name,
          });
        }
      });
    });
    return items;
  }, [rows]);

  // Save Draft
  const handleSaveDraft = async () => {
    if (!weeklyTimesheet || isLocked) return;
    try {
      setSaving(true);
      const items = buildSavePayload();
      await saveWeeklyTimesheet(weeklyTimesheet.id, {
        notes,
        entries: items,
      });
      setIsDirty(false);
      toast.success('Weekly timesheet draft saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save timesheet';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Submit Timesheet
  const handleSubmit = async () => {
    if (!weeklyTimesheet || isLocked) return;

    const totalHours = rows.reduce(
      (acc, r) => acc + Object.values(r.days).reduce((s, h) => s + (h || 0), 0),
      0
    );
    if (totalHours <= 0) {
      toast.error('Cannot submit timesheet with 0 hours logged');
      return;
    }

    if (!window.confirm(`Submit timesheet for ${totalHours.toFixed(1)} hours? You will not be able to edit while awaiting approval.`)) {
      return;
    }

    try {
      setSubmitting(true);
      const items = buildSavePayload();
      await saveWeeklyTimesheet(weeklyTimesheet.id, {
        notes,
        entries: items,
      });
      await submitWeeklyTimesheet(weeklyTimesheet.id);
      setIsDirty(false);
      toast.success('Timesheet submitted for review!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit timesheet';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Withdraw Timesheet
  const handleWithdraw = async () => {
    if (!weeklyTimesheet) return;
    if (!window.confirm('Withdraw timesheet back to draft?')) return;
    try {
      setSubmitting(true);
      await withdrawWeeklyTimesheet(weeklyTimesheet.id);
      toast.info('Timesheet withdrawn to draft');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to withdraw timesheet';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Totals calculations
  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    weekDays.forEach(day => {
      totals[day.dateStr] = rows.reduce((sum, r) => sum + (r.days[day.dateStr] || 0), 0);
    });
    return totals;
  }, [weekDays, rows]);

  const grandTotal = useMemo(() => {
    return Object.values(dayTotals).reduce((sum, h) => sum + h, 0);
  }, [dayTotals]);

  const status = weeklyTimesheet?.status || 'draft';

  return (
    <div className={styles.container}>
      {/* Top Header & Navigation */}
      <div className={styles.topBar}>
        <div className={styles.weekNav}>
          <button className={styles.navBtn} onClick={handlePrevWeek} title="Previous Week">
            ◀ Prev
          </button>
          <span className={styles.weekLabel}>{formatWeekRange(currentWeekMonday)}</span>
          <button className={styles.navBtn} onClick={handleNextWeek} title="Next Week">
            Next ▶
          </button>
          {!isCurrentWeek && (
            <button className={styles.navBtn} onClick={handleThisWeek} title="Current Week">
              This Week
            </button>
          )}
        </div>

        <div className={styles.statusAndActions}>
          <span
            className={`${styles.statusBadge} ${
              status === 'submitted'
                ? styles.statusSubmitted
                : status === 'approved'
                ? styles.statusApproved
                : status === 'rejected'
                ? styles.statusRejected
                : styles.statusDraft
            }`}
          >
            {status === 'submitted'
              ? 'Submitted'
              : status === 'approved'
              ? 'Approved'
              : status === 'rejected'
              ? 'Rejected'
              : 'Draft'}
          </span>

          {!isLocked && (
            <>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowAddRow(prev => !prev)}
                type="button"
              >
                {showAddRow ? 'Cancel' : '➕ Add Row'}
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveDraft}
                disabled={saving || !isDirty}
                type="button"
              >
                {saving ? 'Saving...' : isDirty ? 'Save Draft *' : 'Save Draft'}
              </button>
              <button
                className={styles.btnSubmit}
                onClick={handleSubmit}
                disabled={submitting || grandTotal <= 0}
                type="button"
              >
                {submitting ? 'Submitting...' : 'Submit Timesheet'}
              </button>
            </>
          )}

          {status === 'submitted' && !readOnlyUserView && (
            <button
              className={styles.btnWithdraw}
              onClick={handleWithdraw}
              disabled={submitting}
              type="button"
            >
              Withdraw to Draft
            </button>
          )}
        </div>
      </div>

      {/* Status Notice Banners */}
      {status === 'submitted' && (
        <div className={`${styles.banner} ${styles.bannerSubmitted}`}>
          <span>
            ⏳ <strong>Submitted:</strong> This weekly timesheet is currently awaiting team lead or manager review.
          </span>
          {!readOnlyUserView && (
            <button className={styles.btnWithdraw} onClick={handleWithdraw}>
              Withdraw to Edit
            </button>
          )}
        </div>
      )}

      {status === 'approved' && (
        <div className={`${styles.banner} ${styles.bannerApproved}`}>
          <span>
            ✅ <strong>Approved:</strong> Verified by{' '}
            <strong>{weeklyTimesheet?.approver_name || 'Team Lead'}</strong>
            {weeklyTimesheet?.approved_at ? ` on ${new Date(weeklyTimesheet.approved_at).toLocaleDateString()}` : ''}.
          </span>
        </div>
      )}

      {status === 'rejected' && (
        <div className={`${styles.banner} ${styles.bannerRejected}`}>
          <span>
            ❌ <strong>Rejection Notice:</strong> {weeklyTimesheet?.rejection_reason || 'Please review your logged hours and re-submit.'}
          </span>
        </div>
      )}

      {/* Add Row Toolbar */}
      {showAddRow && !isLocked && (
        <div className={styles.addRowModal}>
          <div className={styles.addRowField}>
            <label htmlFor="new-row-machine">Machine / Order #</label>
            <select
              id="new-row-machine"
              className={styles.addRowSelect}
              value={newRowMachineId}
              onChange={e => {
                const val = e.target.value;
                setNewRowMachineId(val);
                if (!val) {
                  setNewRowEntryType('indirect');
                } else {
                  setNewRowEntryType('production');
                }
              }}
            >
              <option value="">None (Indirect / General Shop)</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.order_number} ({m.model_type})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.addRowField}>
            <label htmlFor="new-row-task">Task / Allocation Target</label>
            {newRowMachineId ? (
              <select
                id="new-row-task"
                className={styles.addRowSelect}
                value={newRowTaskIdentifier}
                onChange={e => setNewRowTaskIdentifier(e.target.value)}
                disabled={loadingMachineTasks}
              >
                <option value="">Select a task...</option>
                {machineTasks.length > 0 && (
                  <optgroup label="📋 Quoted Tasks Allocated by Lead">
                    {machineTasks.map(t => (
                      <option key={t.id} value={`task:${t.id}`}>
                        [{t.department}] {t.task_name} (Quoted: {t.quoted_hours}h)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="🏢 Core Department Tasks">
                  {departmentTasks
                    .filter(t => t.is_active)
                    .map(t => (
                      <option key={t.id} value={`dept:${t.task_code}`}>
                        [{t.department}] {t.task_name} (Default: {t.default_quoted_hours}h)
                      </option>
                    ))}
                </optgroup>
              </select>
            ) : (
              <select
                id="new-row-task"
                className={styles.addRowSelect}
                value={newRowTaskIdentifier}
                onChange={e => setNewRowTaskIdentifier(e.target.value)}
              >
                {INDIRECT_TASKS.map(task => (
                  <option key={task} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.addRowField}>
            <label htmlFor="new-row-type">Type</label>
            <select
              id="new-row-type"
              className={styles.addRowSelect}
              value={newRowEntryType}
              onChange={e => setNewRowEntryType(e.target.value as TimeEntryType)}
            >
              <option value="production">Production</option>
              <option value="rework">Rework</option>
              <option value="issue_fix">Issue Fix</option>
              <option value="indirect">Indirect</option>
            </select>
          </div>

          <button
            className={styles.btnPrimary}
            onClick={handleAddRow}
            disabled={!newRowTaskIdentifier}
            type="button"
          >
            Add to Grid
          </button>
        </div>
      )}

      {/* Matrix Table */}
      <div className={styles.gridCard}>
        <div className={styles.tableContainer}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th style={{ minWidth: '130px' }}>Machine #</th>
                <th style={{ minWidth: '200px' }}>Task Description</th>
                <th style={{ minWidth: '90px' }}>Type</th>
                {weekDays.map(day => (
                  <th
                    key={day.dateStr}
                    className={`${styles.dayTh} ${day.dateStr === new Date().toISOString().split('T')[0] ? styles.dayThToday : ''}`}
                  >
                    <div>{day.dayName}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{day.shortDate}</div>
                  </th>
                ))}
                <th style={{ minWidth: '70px', textAlign: 'right', paddingRight: '1rem' }}>Total</th>
                {!isLocked && <th style={{ width: '40px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                    Loading weekly timesheet...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '2.5rem', color: '#888' }}>
                    No time logged for this week yet. Click <strong>➕ Add Row</strong> to select a machine task and log hours.
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const rowTotal = Object.values(row.days).reduce((s, h) => s + (h || 0), 0);
                  return (
                    <tr key={row.rowKey}>
                      <td>
                        <strong>{row.order_number || 'Indirect / Shop'}</strong>
                      </td>
                      <td>
                        <div>{row.task_name}</div>
                        {row.department && (
                          <span style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>
                            {row.department}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color:
                              row.entry_type === 'production'
                                ? '#00e5ff'
                                : row.entry_type === 'rework'
                                ? '#ff7043'
                                : row.entry_type === 'issue_fix'
                                ? '#ffca28'
                                : '#aaa',
                          }}
                        >
                          {row.entry_type}
                        </span>
                      </td>

                      {weekDays.map(day => {
                        const val = row.days[day.dateStr];
                        return (
                          <td key={day.dateStr} style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max="24"
                              aria-label={`${row.task_name} on ${day.fullName}`}
                              className={styles.cellInput}
                              value={val !== undefined && val !== 0 ? val : ''}
                              placeholder="—"
                              disabled={isLocked}
                              onChange={e => handleCellChange(row.rowKey, day.dateStr, e.target.value)}
                            />
                          </td>
                        );
                      })}

                      <td className={styles.rowTotal}>{rowTotal.toFixed(1)}h</td>

                      {!isLocked && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className={styles.removeRowBtn}
                            onClick={() => handleRemoveRow(row.rowKey)}
                            title="Remove row"
                            type="button"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className={styles.footerRow}>
                  <td colSpan={3} style={{ textAlign: 'right', paddingRight: '1rem' }}>
                    Daily Total:
                  </td>
                  {weekDays.map(day => (
                    <td key={day.dateStr} style={{ textAlign: 'center' }}>
                      {(dayTotals[day.dateStr] || 0).toFixed(1)}h
                    </td>
                  ))}
                  <td className={`${styles.rowTotal} ${styles.grandTotal}`}>
                    {grandTotal.toFixed(1)}h
                  </td>
                  {!isLocked && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Notes Section */}
        <div className={styles.bottomSection}>
          <div className={styles.notesGroup}>
            <label htmlFor="timesheet-notes">Weekly Timesheet Notes & Remarks</label>
            <textarea
              id="timesheet-notes"
              className={styles.notesTextarea}
              rows={2}
              placeholder="Add any context or notes for the lead reviewer..."
              value={notes}
              disabled={isLocked}
              onChange={e => {
                setNotes(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>

          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#888' }}>Total Logged This Week:</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--vtr-theme-primary, #00e5ff)' }}>
              {grandTotal.toFixed(2)} hrs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
