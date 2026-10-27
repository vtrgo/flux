"use client";

import React, { memo } from 'react';
import {
  GridRow,
  Machine,
  MachineAssembly,
  DepartmentTask,
  ProjectTask,
  TimeEntryType,
  ReworkItem,
  Defect,
} from '../../types';
import { formatHours } from '../../lib/dateUtils';
import { TimesheetDayCell } from './TimesheetDayCell';
import styles from '../WeeklyTimesheetGrid.module.css';

interface DayInfo {
  dateStr: string;
  dayName: string;
  shortDate: string;
  fullName: string;
}

const INDIRECT_TASKS = [
  'General Shop Maintenance',
  'Safety / 5S Cleaning',
  'Team Meeting / Training',
  'Tooling & Equipment Care',
  'Material Handling & Staging',
  'Shop Floor Support',
];

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

interface TimesheetGridRowProps {
  row: GridRow;
  machines: Machine[];
  machineAssemblies?: MachineAssembly[];
  departmentTasks: DepartmentTask[];
  machineTasks: ProjectTask[];
  machineReworks: ReworkItem[];
  machineDefects: Defect[];
  weekDays: DayInfo[];
  effectiveDepartment: string;
  isLocked: boolean;
  onMachineChange: (rowKey: string, machineId: string) => void;
  onAssemblyChange: (rowKey: string, assemblyId: string) => void;
  onTaskChange: (rowKey: string, taskIdentifier: string) => void;
  onReworkItemChange: (rowKey: string, reworkId: string) => void;
  onDefectChange: (rowKey: string, defectId: string) => void;
  onTypeChange: (rowKey: string, type: TimeEntryType) => void;
  onCellChange: (rowKey: string, dateStr: string, valueStr: string) => void;
  onRemoveRow: (rowKey: string) => void;
}

export const TimesheetGridRow = memo(function TimesheetGridRow({
  row,
  machines,
  machineAssemblies,
  departmentTasks,
  machineTasks,
  machineReworks,
  machineDefects,
  weekDays,
  effectiveDepartment,
  isLocked,
  onMachineChange,
  onAssemblyChange,
  onTaskChange,
  onReworkItemChange,
  onDefectChange,
  onTypeChange,
  onCellChange,
  onRemoveRow,
}: TimesheetGridRowProps) {
  const rowTotal = Object.values(row.days).reduce((s, h) => s + (h || 0), 0);

  const deptMachineTasks = machineTasks.filter(
    t => matchesDepartment(t.department, effectiveDepartment) || t.id === row.project_task_id
  );

  const availableDeptTasks = departmentTasks.filter(
    t => t.is_active && (matchesDepartment(t.department, effectiveDepartment) || t.id === row.task_id)
  );

  return (
    <tr>
      {/* Machine Selection */}
      <td>
        {!isLocked ? (
          <select
            aria-label="Machine / Order #"
            data-row-key={row.rowKey}
            className={styles.rowSelect}
            value={row.machine_id || (row.task_name && !row.machine_id ? 'none' : '')}
            onChange={e => onMachineChange(row.rowKey, e.target.value)}
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

      {/* Assembly Selection */}
      <td>
        {!isLocked ? (
          row.machine_id && row.machine_id !== 'none' ? (
            <select
              aria-label="Assembly / Sub-assembly"
              className={styles.rowSelect}
              value={row.assembly_id || ''}
              onChange={e => onAssemblyChange(row.rowKey, e.target.value)}
            >
              <option value="">General Machine Labor (No Assembly)</option>
              {machineAssemblies && machineAssemblies.length > 0 && (
                <optgroup label="📦 Machine Assemblies">
                  {machineAssemblies.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.assembly_code}] {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <select
              aria-label="Assembly / Sub-assembly"
              className={styles.rowSelect}
              disabled
              value=""
            >
              <option value="">N/A (Indirect / Shop)</option>
            </select>
          )
        ) : (
          <div>
            {row.assembly_code ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                [{row.assembly_code}] {row.assembly_name || ''}
              </span>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>General</span>
            )}
          </div>
        )}
      </td>

      {/* Task Selection */}
      <td>
        {!isLocked ? (
          row.entry_type === 'rework' ? (
            row.machine_id && row.machine_id !== 'none' ? (
              <select
                aria-label="Rework / Allocation Target"
                className={styles.rowSelect}
                value={row.rework_item_id || ''}
                onChange={e => onReworkItemChange(row.rowKey, e.target.value)}
              >
                <option value="">Select Rework Item...</option>
                {machineReworks.length > 0 && (
                  <optgroup label="🔧 Active Rework Orders">
                    {machineReworks.map(rw => (
                      <option key={rw.id} value={rw.id}>
                        {rw.is_ncr && rw.ncr_number ? `[NCR #${rw.ncr_number}] ` : ''}
                        {rw.part_number} - {rw.description} ({rw.status.replace(/_/g, ' ')})
                      </option>
                    ))}
                  </optgroup>
                )}
                {machineReworks.length === 0 && (
                  <option disabled value="">
                    No rework orders found for this machine
                  </option>
                )}
                {row.rework_item_id &&
                  !machineReworks.some(rw => rw.id === row.rework_item_id) && (
                    <option value={row.rework_item_id}>
                      {row.task_name || 'Linked Rework Order'}
                    </option>
                  )}
              </select>
            ) : (
              <select
                aria-label="Rework / Allocation Target"
                className={styles.rowSelect}
                disabled
                value=""
              >
                <option value="">Select a Machine first...</option>
              </select>
            )
          ) : row.entry_type === 'issue_fix' ? (
            row.machine_id && row.machine_id !== 'none' ? (
              <select
                aria-label="Defect / Allocation Target"
                className={styles.rowSelect}
                value={row.defect_id || ''}
                onChange={e => onDefectChange(row.rowKey, e.target.value)}
              >
                <option value="">Select Issue / Defect...</option>
                {machineDefects.length > 0 && (
                  <optgroup label="⚠️ Machine Defects & Issues">
                    {machineDefects.map(d => (
                      <option key={d.id} value={d.id}>
                        [{d.severity.toUpperCase()}] {d.description} ({d.status})
                      </option>
                    ))}
                  </optgroup>
                )}
                {machineDefects.length === 0 && (
                  <option disabled value="">
                    No open defects found for this machine
                  </option>
                )}
                {row.defect_id &&
                  !machineDefects.some(d => d.id === row.defect_id) && (
                    <option value={row.defect_id}>
                      {row.task_name || 'Linked Defect'}
                    </option>
                  )}
              </select>
            ) : (
              <select
                aria-label="Defect / Allocation Target"
                className={styles.rowSelect}
                disabled
                value=""
              >
                <option value="">Select a Machine first...</option>
              </select>
            )
          ) : row.machine_id && row.machine_id !== 'none' ? (
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
              onChange={e => onTaskChange(row.rowKey, e.target.value)}
            >
              <option value="">Select a task...</option>
              {availableDeptTasks.length > 0 && (
                <optgroup label={`📋 Authoritative ${effectiveDepartment ? `${effectiveDepartment.toUpperCase()} ` : ''}Tasks`}>
                  {availableDeptTasks.map(t => {
                    const matchingPt = machineTasks.find(
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
              onChange={e => onTaskChange(row.rowKey, e.target.value)}
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
            onChange={e => onTypeChange(row.rowKey, e.target.value as TimeEntryType)}
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
      {weekDays.map(day => (
        <TimesheetDayCell
          key={day.dateStr}
          rowKey={row.rowKey}
          taskName={row.task_name}
          dateStr={day.dateStr}
          dayFullName={day.fullName}
          value={row.days[day.dateStr]}
          disabled={isLocked}
          onChange={onCellChange}
        />
      ))}

      <td className={styles.rowTotal}>{formatHours(rowTotal)}h</td>

      {!isLocked && (
        <td style={{ textAlign: 'center' }}>
          <button
            className={styles.removeRowBtn}
            onClick={() => onRemoveRow(row.rowKey)}
            title="Remove row"
            type="button"
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  );
});
