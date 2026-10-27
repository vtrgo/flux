"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../lib/api';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { getSundayOfWeek, addWeeks, getWeekDays } from '../lib/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import {
  Machine,
  MachineAssembly,
  DepartmentTask,
  ProjectTask,
  TimeEntryType,
  WeeklyTimesheetSaveItem,
  ReworkItem,
  Defect,
  GridRow,
} from '../types';
import { TimesheetPrintModal } from './TimesheetPrintModal';
import { TimesheetHeaderBar } from './timesheet/TimesheetHeaderBar';
import { TimesheetStatusBanner } from './timesheet/TimesheetStatusBanner';
import { TimesheetGridRow } from './timesheet/TimesheetGridRow';
import { TimesheetTotalsFooter } from './timesheet/TimesheetTotalsFooter';
import styles from './WeeklyTimesheetGrid.module.css';

export type { GridRow };

interface WeeklyTimesheetGridProps {
  machines: Machine[];
  departmentTasks?: DepartmentTask[];
  initialWeekStart?: string;
  readOnlyUserView?: boolean;
  userDepartment?: string;
  targetUserId?: string;
  hideDateNav?: boolean;
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

export function WeeklyTimesheetGrid({
  machines,
  departmentTasks = [],
  initialWeekStart,
  readOnlyUserView = false,
  userDepartment,
  targetUserId,
  hideDateNav = false,
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
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Cache allocated tasks, rework items, and defects per machine
  const [machineTasksCache, setMachineTasksCache] = useState<Record<string, ProjectTask[]>>({});
  const [machineReworksCache, setMachineReworksCache] = useState<Record<string, ReworkItem[]>>({});
  const [machineDefectsCache, setMachineDefectsCache] = useState<Record<string, Defect[]>>({});
  const [machineAssembliesCache, setMachineAssembliesCache] = useState<Record<string, MachineAssembly[]>>({});

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
      const assemblyKey = entry.assembly_id || 'general';
      const taskKey = entry.rework_item_id || entry.defect_id || entry.task_id || entry.project_task_id || entry.task_name || 'general';
      const typeKey = entry.entry_type || 'production';
      const rowKey = `${machineKey}:${assemblyKey}:${taskKey}:${typeKey}`;

      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          rowKey,
          machine_id: entry.machine_id,
          order_number: entry.order_number || (entry.machine_id ? machines.find(m => m.id === entry.machine_id)?.order_number : undefined),
          assembly_id: entry.assembly_id,
          assembly_code: entry.assembly_code,
          assembly_name: entry.assembly_name,
          project_task_id: entry.project_task_id,
          task_id: entry.task_id,
          rework_item_id: entry.rework_item_id,
          defect_id: entry.defect_id,
          task_name: entry.task_name || (entry.rework_part_number ? `Rework: ${entry.rework_part_number}` : 'General Task'),
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

  // Pre-load machine tasks, rework items, and defects for unique machine IDs present in rows
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
      if (!machineReworksCache[machineId]) {
        fetchApi<ReworkItem[]>('rework/items', { params: { machine_id: machineId } })
          .then(items => {
            setMachineReworksCache(prev => ({ ...prev, [machineId]: items || [] }));
          })
          .catch(err => {
            console.error('Failed to load rework items for machine', machineId, err);
          });
      }
      if (!machineDefectsCache[machineId]) {
        fetchApi<Defect[]>(`machines/${machineId}/defects`)
          .then(defects => {
            setMachineDefectsCache(prev => ({ ...prev, [machineId]: defects || [] }));
          })
          .catch(err => {
            console.error('Failed to load defects for machine', machineId, err);
          });
      }
      if (!machineAssembliesCache[machineId]) {
        fetchApi<MachineAssembly[]>(`machines/${machineId}/assemblies/list`)
          .then(assemblies => {
            setMachineAssembliesCache(prev => ({ ...prev, [machineId]: assemblies || [] }));
          })
          .catch(err => {
            console.error('Failed to load assemblies for machine', machineId, err);
          });
      }
    });
  }, [uniqueMachineIds, machineTasksCache, machineReworksCache, machineDefectsCache, machineAssembliesCache]);

  const isLocked = useMemo(() => {
    if (readOnlyUserView) return true;
    if (!weeklyTimesheet) return false;
    return weeklyTimesheet.status === 'approved';
  }, [weeklyTimesheet, readOnlyUserView]);

  // Handlers for week navigation
  const handlePrevWeek = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(prev => addWeeks(prev, -1));
  }, [isDirty]);

  const handleNextWeek = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(prev => addWeeks(prev, 1));
  }, [isDirty]);

  const handleThisWeek = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch week?')) return;
    setCurrentWeekSunday(getSundayOfWeek());
  }, [isDirty]);

  // Inline row changes
  const handleMachineChange = useCallback(async (rowKey: string, machineId: string) => {
    if (isLocked) return;
    const selectedMachine = machines.find(m => m.id === machineId);
    const isValidMachine = machineId && machineId !== 'none';

    if (isValidMachine) {
      if (!machineTasksCache[machineId]) {
        fetchApi<ProjectTask[]>(`machines/${machineId}/tasks`)
          .then(tasks => setMachineTasksCache(prev => ({ ...prev, [machineId]: tasks || [] })))
          .catch(err => console.error('Failed to load tasks for machine', machineId, err));
      }
      if (!machineReworksCache[machineId]) {
        fetchApi<ReworkItem[]>('rework/items', { params: { machine_id: machineId } })
          .then(items => setMachineReworksCache(prev => ({ ...prev, [machineId]: items || [] })))
          .catch(err => console.error('Failed to load rework items for machine', machineId, err));
      }
      if (!machineDefectsCache[machineId]) {
        fetchApi<Defect[]>(`machines/${machineId}/defects`)
          .then(defects => setMachineDefectsCache(prev => ({ ...prev, [machineId]: defects || [] })))
          .catch(err => console.error('Failed to load defects for machine', machineId, err));
      }
      if (!machineAssembliesCache[machineId]) {
        fetchApi<MachineAssembly[]>(`machines/${machineId}/assemblies/list`)
          .then(assemblies => setMachineAssembliesCache(prev => ({ ...prev, [machineId]: assemblies || [] })))
          .catch(err => console.error('Failed to load assemblies for machine', machineId, err));
      }
    }

    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        const entryType: TimeEntryType = !isValidMachine ? 'indirect' : r.entry_type;
        const defaultDept = !isValidMachine ? 'shop' : (r.department || 'assembly');

        return {
          ...r,
          machine_id: machineId === 'none' ? undefined : (machineId || undefined),
          order_number: selectedMachine?.order_number,
          assembly_id: undefined,
          assembly_code: undefined,
          assembly_name: undefined,
          project_task_id: undefined,
          task_id: undefined,
          rework_item_id: undefined,
          defect_id: undefined,
          task_name: !isValidMachine ? INDIRECT_TASKS[0] : '',
          department: defaultDept,
          entry_type: entryType,
        };
      })
    );
    setIsDirty(true);
  }, [isLocked, machines, machineTasksCache, machineReworksCache, machineDefectsCache, machineAssembliesCache]);

  const handleAssemblyChange = useCallback((rowKey: string, assemblyId: string) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        const asm = r.machine_id && machineAssembliesCache[r.machine_id]?.find(a => a.id === assemblyId);
        return {
          ...r,
          assembly_id: assemblyId || undefined,
          assembly_code: asm ? asm.assembly_code : undefined,
          assembly_name: asm ? asm.name : undefined,
        };
      })
    );
    setIsDirty(true);
  }, [isLocked, machineAssembliesCache]);

  const handleTaskChange = useCallback((rowKey: string, taskIdentifier: string) => {
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
  }, [isLocked, departmentTasks, machineTasksCache]);

  const handleReworkItemChange = useCallback((rowKey: string, reworkId: string) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        const reworks = r.machine_id ? machineReworksCache[r.machine_id] || [] : [];
        const found = reworks.find(rw => rw.id === reworkId);
        if (found) {
          const partLabel = found.part_number || 'Part';
          const descLabel = found.description ? ` - ${found.description}` : '';
          return {
            ...r,
            rework_item_id: found.id,
            defect_id: found.defect_id || undefined,
            task_name: `Rework: ${partLabel}${descLabel}`,
            project_task_id: undefined,
            task_id: undefined,
          };
        }
        return {
          ...r,
          rework_item_id: reworkId || undefined,
          task_name: reworkId ? r.task_name : '',
          project_task_id: undefined,
          task_id: undefined,
        };
      })
    );
    setIsDirty(true);
  }, [isLocked, machineReworksCache]);

  const handleDefectChange = useCallback((rowKey: string, defectId: string) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;
        const defects = r.machine_id ? machineDefectsCache[r.machine_id] || [] : [];
        const found = defects.find(d => d.id === defectId);
        if (found) {
          return {
            ...r,
            defect_id: found.id,
            rework_item_id: undefined,
            task_name: `Issue Fix: ${found.description}`,
            department: found.assigned_department || r.department || effectiveDepartment || 'quality',
            project_task_id: undefined,
            task_id: undefined,
          };
        }
        return {
          ...r,
          defect_id: defectId || undefined,
          task_name: defectId ? r.task_name : '',
          rework_item_id: undefined,
          project_task_id: undefined,
          task_id: undefined,
        };
      })
    );
    setIsDirty(true);
  }, [isLocked, machineDefectsCache, effectiveDepartment]);

  const handleTypeChange = useCallback((rowKey: string, type: TimeEntryType) => {
    if (isLocked) return;
    setRows(prev =>
      prev.map(r => {
        if (r.rowKey !== rowKey) return r;

        if (r.machine_id && r.machine_id !== 'none') {
          if (type === 'rework' && !machineReworksCache[r.machine_id]) {
            fetchApi<ReworkItem[]>('rework/items', { params: { machine_id: r.machine_id } })
              .then(items => setMachineReworksCache(prev => ({ ...prev, [r.machine_id!]: items || [] })))
              .catch(err => console.error('Failed to load rework items for machine', r.machine_id, err));
          } else if (type === 'issue_fix' && !machineDefectsCache[r.machine_id]) {
            fetchApi<Defect[]>(`machines/${r.machine_id}/defects`)
              .then(defects => setMachineDefectsCache(prev => ({ ...prev, [r.machine_id!]: defects || [] })))
              .catch(err => console.error('Failed to load defects for machine', r.machine_id, err));
          }
        }

        if (type === 'rework') {
          return {
            ...r,
            entry_type: type,
            project_task_id: undefined,
            task_id: undefined,
            task_name: r.rework_item_id ? r.task_name : '',
          };
        }
        if (type === 'issue_fix') {
          return {
            ...r,
            entry_type: type,
            project_task_id: undefined,
            task_id: undefined,
            rework_item_id: undefined,
            task_name: r.defect_id ? r.task_name : '',
          };
        }
        if (type === 'production') {
          return {
            ...r,
            entry_type: type,
            rework_item_id: undefined,
            defect_id: undefined,
            task_name: r.task_id || r.project_task_id ? r.task_name : '',
          };
        }
        if (type === 'indirect') {
          return {
            ...r,
            entry_type: type,
            machine_id: undefined,
            order_number: undefined,
            project_task_id: undefined,
            task_id: undefined,
            rework_item_id: undefined,
            defect_id: undefined,
            task_name: INDIRECT_TASKS[0],
            department: 'shop',
          };
        }
        return { ...r, entry_type: type };
      })
    );
    setIsDirty(true);
  }, [isLocked, machineReworksCache, machineDefectsCache]);

  // Cell change handler
  const handleCellChange = useCallback((rowKey: string, dateStr: string, valueStr: string) => {
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
  }, [isLocked]);

  // Add a blank row directly into the grid
  const handleAddRow = useCallback(() => {
    if (isLocked) return;
    const newRow = createBlankRow();
    setPendingFocusRowKey(newRow.rowKey);
    setRows(prev => [...prev, newRow]);
    setIsDirty(true);
  }, [isLocked]);

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
  const handleRemoveRow = useCallback((rowKey: string) => {
    if (isLocked) return;
    setRows(prev => {
      const filtered = prev.filter(r => r.rowKey !== rowKey);
      return filtered.length === 0 ? [createBlankRow()] : filtered;
    });
    setIsDirty(true);
  }, [isLocked]);

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
            assembly_id: row.assembly_id || undefined,
            entry_type: row.entry_type,
            project_task_id: row.project_task_id || undefined,
            task_id: row.task_id || undefined,
            rework_item_id: row.rework_item_id || undefined,
            defect_id: row.defect_id || undefined,
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

  // Save Timesheet
  const handleSaveTimesheet = useCallback(async () => {
    if (!weeklyTimesheet || isLocked) return;
    try {
      setSaving(true);
      const items = buildSavePayload();
      await saveWeeklyTimesheet(weeklyTimesheet.id, {
        notes,
        entries: items,
      });
      setIsDirty(false);
      toast.success('Weekly timesheet saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save timesheet';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [weeklyTimesheet, isLocked, buildSavePayload, saveWeeklyTimesheet, notes]);

  // Submit Timesheet to Manager for Approval
  const handleSubmitTimesheet = useCallback(async () => {
    if (!weeklyTimesheet || isLocked) return;
    try {
      setSubmitting(true);
      if (isDirty) {
        const items = buildSavePayload();
        await saveWeeklyTimesheet(weeklyTimesheet.id, {
          notes,
          entries: items,
        });
        setIsDirty(false);
      }
      await submitWeeklyTimesheet(weeklyTimesheet.id);
      toast.success('Weekly timesheet submitted to manager for approval');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit timesheet';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [weeklyTimesheet, isLocked, isDirty, buildSavePayload, saveWeeklyTimesheet, notes, submitWeeklyTimesheet]);

  // Withdraw Submitted Timesheet for Edits
  const handleWithdrawTimesheet = useCallback(async () => {
    if (!weeklyTimesheet) return;
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
  }, [weeklyTimesheet, withdrawWeeklyTimesheet]);

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
      <TimesheetHeaderBar
        hideDateNav={hideDateNav}
        readOnlyUserView={readOnlyUserView}
        currentWeekSunday={currentWeekSunday}
        isCurrentWeek={isCurrentWeek}
        weeklyTimesheet={weeklyTimesheet}
        isLocked={isLocked}
        saving={saving}
        submitting={submitting}
        isDirty={isDirty}
        grandTotal={grandTotal}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onThisWeek={handleThisWeek}
        onOpenPrint={() => setIsPrintModalOpen(true)}
        onSave={handleSaveTimesheet}
        onSubmit={handleSubmitTimesheet}
        onWithdraw={handleWithdrawTimesheet}
      />

      {/* Lockout / Status Banners */}
      <TimesheetStatusBanner
        weeklyTimesheet={weeklyTimesheet}
        readOnlyUserView={readOnlyUserView}
      />

      {/* Matrix Table */}
      <div className={styles.gridCard}>
        <div className={styles.tableContainer}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>Machine #</th>
                <th style={{ minWidth: '170px' }}>Assembly</th>
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
                  <td colSpan={12} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                    Loading weekly timesheet...
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <TimesheetGridRow
                    key={row.rowKey}
                    row={row}
                    machines={machines}
                    machineAssemblies={row.machine_id ? machineAssembliesCache[row.machine_id] || [] : []}
                    departmentTasks={departmentTasks}
                    machineTasks={row.machine_id ? machineTasksCache[row.machine_id] || [] : []}
                    machineReworks={row.machine_id ? machineReworksCache[row.machine_id] || [] : []}
                    machineDefects={row.machine_id ? machineDefectsCache[row.machine_id] || [] : []}
                    weekDays={weekDays}
                    effectiveDepartment={effectiveDepartment}
                    isLocked={isLocked}
                    onMachineChange={handleMachineChange}
                    onAssemblyChange={handleAssemblyChange}
                    onTaskChange={handleTaskChange}
                    onReworkItemChange={handleReworkItemChange}
                    onDefectChange={handleDefectChange}
                    onTypeChange={handleTypeChange}
                    onCellChange={handleCellChange}
                    onRemoveRow={handleRemoveRow}
                  />
                ))
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
                  <td colSpan={weekDays.length + 6} className={styles.newRowSlotCell}>
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
              <TimesheetTotalsFooter
                weekDays={weekDays}
                dayTotals={dayTotals}
                grandTotal={grandTotal}
                isLocked={isLocked}
              />
            )}
          </table>
        </div>

        {/* Notes & Summary Section */}
        <div className={styles.bottomSection}>
          {!readOnlyUserView && (
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
          )}

          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.85rem', color: '#888' }}>Total Logged This Week:</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--vtr-theme-primary, #00e5ff)' }}>
              {grandTotal.toFixed(2)} hrs
            </span>
          </div>
        </div>
      </div>

      <TimesheetPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        timesheet={weeklyTimesheet}
        employeeName={
          weeklyTimesheet?.user_name ||
          (authUser
            ? authUser.first_name
              ? `${authUser.first_name} ${authUser.last_name || ''}`.trim()
              : authUser.username
            : '')
        }
        department={effectiveDepartment}
        weekStartDate={currentWeekSunday}
        rows={rows}
      />
    </div>
  );
}
