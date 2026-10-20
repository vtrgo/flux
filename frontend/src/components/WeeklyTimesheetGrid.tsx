"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../lib/api';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { getSundayOfWeek, addWeeks, getWeekDays, formatWeekRange } from '../lib/dateUtils';
import { useAuth } from '../contexts/AuthContext';
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
  departmentTasks?: DepartmentTask[];
  initialWeekStart?: string;
  readOnlyUserView?: boolean;
  userDepartment?: string;
  targetUserId?: string;
}

interface GridRow {
  rowKey: string;
  machine_id?: string;
  order_number?: string;
  project_task_id?: string;
  task_id?: string;
  task_name: string;
  department?: string;
  entry_type: TimeEntryType;
  days: Record<string, number>; // dateStr -> hours
  descriptions: Record<string, string>; // dateStr -> description
  entry_ids?: Record<string, string>; // dateStr -> time_entry id
}

const INDIRECT_TASKS = [
  'General Shop Maintenance',
  'Safety / 5S Cleaning',
  'Team Meeting / Training',
  'Tooling & Equipment Care',
  'Material Handling & Staging',
  'Shop Floor Support',
];

const createBlankRow = (): GridRow => ({
  rowKey: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  machine_id: '',
  order_number: '',
  project_task_id: '',
  task_id: '',
  task_name: '',
  department: '',
  entry_type: 'production',
  days: {},
  descriptions: {},
  entry_ids: {},
});

function matchesDepartment(taskDept?: string, userDept?: string): boolean {
  if (!userDept) return true;
  if (!taskDept) return true;
  const td = taskDept.toLowerCase().replace(/[-_]/g, '');
  const ud = userDept.toLowerCase().replace(/[-_]/g, '');
  if (td === ud) return true;
  if ((td === 'controls' || td === 'electricalcontrols') && (ud === 'controls' || ud === 'electricalcontrols')) {
    return true;
  }
  return false;
}

export function WeeklyTimesheetGrid({
  machines,
  departmentTasks = [],
  initialWeekStart,
  readOnlyUserView = false,
  userDepartment,
  targetUserId,
}: WeeklyTimesheetGridProps) {
  const { user: authUser } = useAuth();
  const effectiveDepartment = useMemo(() => {
    return (
      userDepartment ||
      authUser?.department ||
      ''
    ).toLowerCase().trim();
  }, [userDepartment, authUser?.department]);

  const [currentWeekSunday, setCurrentWeekSunday] = useState<string>(() =>
    initialWeekStart ? getSundayOfWeek(initialWeekStart) : getSundayOfWeek()
  );

  const {
    weeklyTimesheet,
    loading,
    fetchWeeklyTimesheet,
    saveWeeklyTimesheet,
    submitWeeklyTimesheet,
    withdrawWeeklyTimesheet,
  } = useTimesheetData();

  const [rows, setRows] = useState<GridRow[]>([createBlankRow()]);
  const [pendingFocusRowKey, setPendingFocusRowKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Cache allocated tasks per machine to support inline selects on multiple rows
  const [machineTasksCache, setMachineTasksCache] = useState<Record<string, ProjectTask[]>>({});

  const weekDays = useMemo(() => getWeekDays(currentWeekSunday), [currentWeekSunday]);
  const isCurrentWeek = useMemo(() => getSundayOfWeek() === currentWeekSunday, [currentWeekSunday]);

  // Load weekly timesheet whenever the selected week or target user changes
  useEffect(() => {
    fetchWeeklyTimesheet(currentWeekSunday, targetUserId);
  }, [currentWeekSunday, targetUserId, fetchWeeklyTimesheet]);

  // Sync state when weeklyTimesheet loads
  useEffect(() => {
    if (!weeklyTimesheet || Array.isArray(weeklyTimesheet)) {
      setRows([createBlankRow()]);
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
      const taskKey = entry.task_id || entry.project_task_id || entry.task_name || 'general';
      const typeKey = entry.entry_type || 'production';
      const rowKey = `${machineKey}:${taskKey}:${typeKey}`;

      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          rowKey,
          machine_id: entry.machine_id,
          order_number: entry.order_number || (entry.machine_id ? machines.find(m => m.id === entry.machine_id)?.order_number : undefined),
          project_task_id: entry.project_task_id,
          task_id: entry.task_id,
          task_name: entry.task_name || 'General Task',
          department: entry.department,
          entry_type: entry.entry_type || 'production',
          days: {},
          descriptions: {},
          entry_ids: {},
        });
      }

      const row = rowMap.get(rowKey)!;
      row.days[entry.work_date] = (row.days[entry.work_date] || 0) + entry.hours_spent;
      if (entry.work_description) {
        row.descriptions[entry.work_date] = entry.work_description;
      }
      if (entry.id) {
        row.entry_ids = row.entry_ids || {};
        row.entry_ids[entry.work_date] = entry.id;
      }
    });

    const list = Array.from(rowMap.values());
    setRows(list.length === 0 ? [createBlankRow()] : list);
    setIsDirty(false);
  }, [weeklyTimesheet, machines]);

  // Pre-load machine tasks for unique machine IDs present in rows
  const uniqueMachineIds = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.machine_id).filter((id): id is string => Boolean(id && id !== 'none'))));
  }, [rows]);

  useEffect(() => {
    uniqueMachineIds.forEach(machineId => {
      if (!machineTasksCache[machineId]) {
        fetchApi<ProjectTask[]>(`machines/${machineId}/tasks`)
          .then(tasks => {
            setMachineTasksCache(prev => ({ ...prev, [machineId]: tasks || [] }));
          })
          .catch(err => {
            console.error('Failed to load tasks for machine', machineId, err);
          });
      }
    });
  }, [uniqueMachineIds, machineTasksCache]);

  const isLocked = useMemo(() => {
    if (readOnlyUserView) return true;
    if (!weeklyTimesheet) return false;
    return weeklyTimesheet.status === 'approved';
  }, [weeklyTimesheet, readOnlyUserView]);

  // Handlers for week navigation
  const handlePrevWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(prev => addWeeks(prev, -1));
  };

  const handleNextWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(prev => addWeeks(prev, 1));
  };

  const handleThisWeek = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(getSundayOfWeek());
  };

  // Inline row changes
  const handleMachineChange = async (rowKey: string, machineId: string) => {
    if (isLocked) return;
    const selectedMachine = machines.find(m => m.id === machineId);
    const entryType: TimeEntryType = machineId && machineId !== 'none' ? 'production' : 'indirect';
    const defaultDept = machineId && machineId !== 'none' ? 'assembly' : 'shop';

    if (machineId && machineId !== 'none' && !machineTasksCache[machineId]) {
      try {
        const tasks = await fetchApi<ProjectTask[]>(`machines/${machineId}/tasks`);
        setMachineTasksCache(prev => ({ ...prev, [machineId]: tasks || [] }));
      } catch (err) {
        console.error('Failed to load tasks for machine', machineId, err);
      }
    }

    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        return {
          ...r,
          machine_id: machineId === 'none' ? undefined : (machineId || undefined),
          order_number: selectedMachine?.order_number,
          project_task_id: undefined,
          task_name: machineId === 'none' ? INDIRECT_TASKS[0] : '',
          department: defaultDept,
          entry_type: entryType,
        };
      })
    );
    setIsDirty(true);
  };

  const handleTaskChange = (rowKey: string, taskIdentifier: string) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        let projectTaskId: string | undefined;
        let taskId: string | undefined;
        let taskName = r.task_name;
        let department = r.department;

        if (taskIdentifier.startsWith('dept:') || taskIdentifier.startsWith('auth:')) {
          const authId = taskIdentifier.replace(/^(dept|auth):/, '');
          const found = departmentTasks.find(t => t.id === authId || t.task_code === authId);
          if (found) {
            taskId = found.id;
            taskName = found.task_name;
            department = found.department;
            const tasks = r.machine_id ? machineTasksCache[r.machine_id] : undefined;
            const matchingPt = tasks?.find(
              pt => (pt.task_id && pt.task_id === found.id) || pt.task_code === found.task_code || pt.task_name === found.task_name
            );
            if (matchingPt) {
              projectTaskId = matchingPt.id;
            }
          }
        } else if (taskIdentifier.startsWith('task:')) {
          const ptId = taskIdentifier.replace('task:', '');
          const tasks = r.machine_id ? machineTasksCache[r.machine_id] : undefined;
          const found = tasks?.find(t => t.id === ptId);
          if (found) {
            projectTaskId = found.id;
            taskId = found.task_id;
            taskName = found.task_name;
            department = found.department;
          }
        } else if (taskIdentifier.startsWith('task_name:')) {
          taskName = taskIdentifier.replace('task_name:', '');
          projectTaskId = undefined;
          taskId = undefined;
        } else if (taskIdentifier) {
          taskName = taskIdentifier;
          projectTaskId = undefined;
          taskId = undefined;
        }

        return {
          ...r,
          project_task_id: projectTaskId,
          task_id: taskId,
          task_name: taskName,
          department,
        };
      })
    );
    setIsDirty(true);
  };

  const handleTypeChange = (rowKey: string, type: TimeEntryType) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => (r.rowKey === rowKey ? { ...r, entry_type: type } : r))
    );
    setIsDirty(true);
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

  // Add a blank row directly into the grid
  const handleAddRow = () => {
    if (isLocked) return;
    const newRow = createBlankRow();
    setPendingFocusRowKey(newRow.rowKey);
    setRows(prev => [...prev, newRow]);
    setIsDirty(true);
  };

  // Automatically focus the Machine select on newly created row
  useEffect(() => {
    if (pendingFocusRowKey) {
      const el = document.querySelector<HTMLSelectElement>(
        `select[data-row-key="${pendingFocusRowKey}"][aria-label="Machine / Order #"]`
      );
      if (el) {
        el.focus();
      }
      setPendingFocusRowKey(null);
    }
  }, [pendingFocusRowKey, rows]);

  // Remove row handler (always maintain at least 1 row)
  const handleRemoveRow = (rowKey: string) => {
    if (isLocked) return;
    setRows(prev => {
      const filtered = prev.filter(r => r.rowKey !== rowKey);
      return filtered.length === 0 ? [createBlankRow()] : filtered;
    });
    setIsDirty(true);
  };

  // Build payload
  const buildSavePayload = useCallback((): WeeklyTimesheetSaveItem[] => {
    const items: WeeklyTimesheetSaveItem[] = [];
    rows.forEach(row => {
      const taskName = row.task_name || (row.machine_id ? 'General Production' : 'General Labor');
      Object.entries(row.days).forEach(([dateStr, hours]) => {
        if (hours > 0) {
          items.push({
            id: row.entry_ids?.[dateStr] || undefined,
            machine_id: row.machine_id && row.machine_id !== 'none' ? row.machine_id : undefined,
            entry_type: row.entry_type,
            project_task_id: row.project_task_id || undefined,
            task_id: row.task_id || undefined,
            department: row.department,
            work_date: dateStr,
            hours_spent: hours,
            work_description: row.descriptions[dateStr] || taskName,
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
      toast.success(weeklyTimesheet.status === 'submitted' ? 'Timesheet changes saved' : 'Weekly timesheet draft saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save timesheet';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Submit for Approval
  const handleSubmit = async () => {
    if (!weeklyTimesheet || isLocked) return;

    const totalHours = rows.reduce(
      (acc, r) => acc + Object.values(r.days).reduce((s, h) => s + (h || 0), 0),
      0
    );

    if (totalHours <= 0) {
      toast.error('Cannot submit an empty timesheet. Please log hours first.');
      return;
    }

    if (!window.confirm(`Submit timesheet for week ${formatWeekRange(currentWeekSunday)} (${totalHours.toFixed(1)} hrs total) for lead review?`)) {
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
      toast.success('Timesheet submitted for team lead approval');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit timesheet';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Withdraw timesheet back to draft
  const handleWithdraw = async () => {
    if (!weeklyTimesheet || weeklyTimesheet.status !== 'submitted') return;
    if (!window.confirm('Withdraw this submitted timesheet back to draft to edit your hours?')) {
      return;
    }
    try {
      setSubmitting(true);
      await withdrawWeeklyTimesheet(weeklyTimesheet.id);
      toast.success('Timesheet withdrawn back to draft');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to withdraw timesheet';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Daily totals calculation
  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    weekDays.forEach(day => {
      totals[day.dateStr] = rows.reduce((acc, row) => acc + (row.days[day.dateStr] || 0), 0);
    });
    return totals;
  }, [rows, weekDays]);

  const grandTotal = useMemo(() => {
    return Object.values(dayTotals).reduce((sum, h) => sum + h, 0);
  }, [dayTotals]);

  return (
    <div className={styles.container}>
      {/* Top Bar: Week Switcher & Status Controls */}
      <div className={styles.topBar}>
        <div className={styles.weekNav}>
          <button
            className={styles.navBtn}
            onClick={handlePrevWeek}
            title="Previous Week"
            type="button"
          >
            ◀ Prev Week
          </button>
          <span className={styles.weekLabel}>{formatWeekRange(currentWeekSunday)}</span>
          <button
            className={styles.navBtn}
            onClick={handleNextWeek}
            title="Next Week"
            type="button"
          >
            Next Week ▶
          </button>
          {!isCurrentWeek && (
            <button
              className={styles.navBtn}
              onClick={handleThisWeek}
              title="Jump to Current Week"
              type="button"
            >
              Current Week
            </button>
          )}
        </div>

        <div className={styles.statusAndActions}>
          {weeklyTimesheet && (
            <span
              className={`${styles.statusBadge} ${
                weeklyTimesheet.status === 'approved'
                  ? styles.statusApproved
                  : weeklyTimesheet.status === 'submitted'
                  ? styles.statusSubmitted
                  : weeklyTimesheet.status === 'rejected'
                  ? styles.statusRejected
                  : styles.statusDraft
              }`}
            >
              {weeklyTimesheet.status.toUpperCase()}
            </span>
          )}

          {!readOnlyUserView && (
            <>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveDraft}
                disabled={isLocked || saving || !isDirty}
                type="button"
              >
                {saving
                  ? 'Saving...'
                  : isDirty
                  ? weeklyTimesheet?.status === 'submitted'
                    ? 'Save Changes *'
                    : 'Save Draft *'
                  : weeklyTimesheet?.status === 'submitted'
                  ? 'Saved'
                  : 'Save Draft'}
              </button>
              {weeklyTimesheet?.status === 'submitted' ? (
                <button
                  className={styles.btnSecondary}
                  onClick={handleWithdraw}
                  disabled={submitting}
                  type="button"
                  title="Withdraw timesheet back to draft"
                >
                  ↩ Withdraw
                </button>
              ) : (
                <button
                  className={styles.btnSuccess}
                  onClick={handleSubmit}
                  disabled={isLocked || submitting || grandTotal <= 0}
                  type="button"
                  title="Submit timesheet to Lead for approval"
                >
                  {submitting ? 'Submitting...' : 'Submit Timesheet'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lockout / Status Banners */}
      {weeklyTimesheet?.status === 'submitted' && (
        <div className={`${styles.banner} ${styles.bannerSubmitted}`}>
          <span>
            ⏳ <strong>Timesheet Submitted:</strong> This timesheet is currently submitted for review. You can still make and save changes until it is approved.
          </span>
        </div>
      )}
      {weeklyTimesheet?.status === 'approved' && (
        <div className={`${styles.banner} ${styles.bannerApproved}`}>
          <span>
            ✅ <strong>Timesheet Approved:</strong> This timesheet has been approved and permanently locked into payroll ledger.
          </span>
        </div>
      )}
      {weeklyTimesheet?.status === 'rejected' && (
        <div className={`${styles.banner} ${styles.bannerRejected}`}>
          <span>
            ❌ <strong>Rejection Notice:</strong> {weeklyTimesheet?.rejection_reason || 'Please review your logged hours and re-submit.'}
          </span>
        </div>
      )}

      {/* Matrix Table */}
      <div className={styles.gridCard}>
        <div className={styles.tableContainer}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>Machine #</th>
                <th style={{ minWidth: '240px' }}>Task Description</th>
                <th style={{ minWidth: '105px' }}>Type</th>
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
              ) : (
                rows.map(row => {
                  const rowTotal = Object.values(row.days).reduce((s, h) => s + (h || 0), 0);
                  const selectedMachineTasks = row.machine_id ? machineTasksCache[row.machine_id] || [] : [];
                  const deptMachineTasks = selectedMachineTasks.filter(
                    t => matchesDepartment(t.department, effectiveDepartment) || t.id === row.project_task_id
                  );

                  const availableDeptTasks = departmentTasks.filter(
                    t => t.is_active && (matchesDepartment(t.department, effectiveDepartment) || t.id === row.task_id)
                  );

                  return (
                    <tr key={row.rowKey}>
                      {/* Machine Selection */}
                      <td>
                        {!isLocked ? (
                          <select
                            aria-label="Machine / Order #"
                            data-row-key={row.rowKey}
                            className={styles.rowSelect}
                            value={row.machine_id || (row.task_name && !row.machine_id ? 'none' : '')}
                            onChange={e => handleMachineChange(row.rowKey, e.target.value)}
                          >
                            <option value="">Select Machine...</option>
                            <option value="none">None (Indirect / General Shop)</option>
                            {machines.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.order_number} ({m.model_type})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <strong>{row.order_number || 'Indirect / Shop'}</strong>
                        )}
                      </td>

                      {/* Task Selection */}
                      <td>
                        {!isLocked ? (
                          row.machine_id && row.machine_id !== 'none' ? (
                            <select
                              aria-label="Task / Allocation Target"
                              className={styles.rowSelect}
                              value={
                                row.task_id
                                  ? `dept:${row.task_id}`
                                  : row.project_task_id
                                  ? `task:${row.project_task_id}`
                                  : row.task_name
                                  ? `task_name:${row.task_name}`
                                  : ''
                              }
                              onChange={e => handleTaskChange(row.rowKey, e.target.value)}
                            >
                              <option value="">Select a task...</option>
                              {availableDeptTasks.length > 0 && (
                                <optgroup label={`📋 Authoritative ${effectiveDepartment ? `${effectiveDepartment.toUpperCase()} ` : ''}Tasks`}>
                                  {availableDeptTasks.map(t => {
                                    const matchingPt = selectedMachineTasks.find(
                                      pt => (pt.task_id && pt.task_id === t.id) || pt.task_code === t.task_code || pt.task_name === t.task_name
                                    );
                                    const budgetNote = matchingPt ? `(Budget: ${matchingPt.quoted_hours}h)` : `(Std: ${t.default_quoted_hours}h)`;
                                    return (
                                      <option key={t.id} value={`dept:${t.id}`}>
                                        [{t.department}] {t.task_name} {budgetNote}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              )}
                              {deptMachineTasks.filter(pt => !availableDeptTasks.some(dt => (pt.task_id && pt.task_id === dt.id) || pt.task_code === dt.task_code)).length > 0 && (
                                <optgroup label="⚙️ Custom Quoted Project Tasks">
                                  {deptMachineTasks
                                    .filter(pt => !availableDeptTasks.some(dt => (pt.task_id && pt.task_id === dt.id) || pt.task_code === dt.task_code))
                                    .map(t => (
                                      <option key={t.id} value={`task:${t.id}`}>
                                        [{t.department}] {t.task_name} (Quoted: {t.quoted_hours}h)
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                              {availableDeptTasks.length === 0 && deptMachineTasks.length === 0 && (
                                <option disabled value="">
                                  No tasks available for {effectiveDepartment || 'department'}
                                </option>
                              )}
                              {row.task_name &&
                                !row.task_id &&
                                !availableDeptTasks.some(t => t.task_name === row.task_name) &&
                                !deptMachineTasks.some(t => t.task_name === row.task_name) && (
                                  <option value={`task_name:${row.task_name}`}>
                                    {row.task_name}
                                  </option>
                                )}
                            </select>
                          ) : (
                            <select
                              aria-label="Task / Allocation Target"
                              className={styles.rowSelect}
                              value={row.task_name || ''}
                              onChange={e => handleTaskChange(row.rowKey, e.target.value)}
                            >
                              <option value="">Select indirect task...</option>
                              <optgroup label="🛠️ Indirect Shop Tasks">
                                {INDIRECT_TASKS.map(task => (
                                  <option key={task} value={task}>
                                    {task}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          )
                        ) : (
                          <div>
                            <div>{row.task_name || 'General Task'}</div>
                            {row.department && (
                              <span style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>
                                {row.department}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Type Selection */}
                      <td>
                        {!isLocked ? (
                          <select
                            aria-label="Type"
                            className={styles.rowTypeSelect}
                            value={row.entry_type}
                            onChange={e => handleTypeChange(row.rowKey, e.target.value as TimeEntryType)}
                          >
                            <option value="production">Production</option>
                            <option value="rework">Rework</option>
                            <option value="issue_fix">Issue Fix</option>
                            <option value="indirect">Indirect</option>
                          </select>
                        ) : (
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
                        )}
                      </td>

                      {/* Day Hour Inputs across Sunday -> Saturday */}
                      {weekDays.map(day => {
                        const val = row.days[day.dateStr];
                        return (
                          <td key={day.dateStr} style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max="24"
                              aria-label={`${row.task_name || 'Task'} on ${day.fullName}`}
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
              {!isLocked && (
                <tr
                  className={styles.newRowSlot}
                  onClick={handleAddRow}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAddRow();
                    }
                  }}
                  aria-label="Add row"
                  title="Click to insert a new row"
                >
                  <td colSpan={weekDays.length + 5} className={styles.newRowSlotCell}>
                    <div className={styles.newRowSlotContent}>
                      <span className={styles.newRowSlotIcon}>➕</span>
                      <span className={styles.newRowSlotLabel}>Add Row</span>
                      <span className={styles.newRowSlotHint}>— Click space to insert a new time record</span>
                    </div>
                  </td>
                </tr>
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
