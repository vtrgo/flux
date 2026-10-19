"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { WeeklyTimesheet, Machine, DepartmentTask } from '../types';
import { formatWeekRange } from '../lib/dateUtils';
import { WeeklyTimesheetGrid } from './WeeklyTimesheetGrid';
import styles from './WeeklyTimesheetGrid.module.css';

interface TimesheetApprovalsTableProps {
  userDepartment?: string;
  isManagerOrAdmin: boolean;
  machines: Machine[];
  departmentTasks: DepartmentTask[];
}

const DEPARTMENTS = [
  { id: 'assembly', label: 'Assembly' },
  { id: 'controls', label: 'Electrical / Controls' },
  { id: 'machine-shop', label: 'Machine Shop' },
  { id: 'laser', label: 'Laser' },
  { id: 'design', label: 'Design' },
  { id: 'enclosures', label: 'Enclosures' },
  { id: 'kitting', label: 'Kitting' },
  { id: 'quality', label: 'Quality / FAT' },
];

export function TimesheetApprovalsTable({
  userDepartment,
  isManagerOrAdmin,
  machines,
  departmentTasks,
}: TimesheetApprovalsTableProps) {
  const {
    approvals,
    fetchApprovals,
    approveWeeklyTimesheet,
    rejectWeeklyTimesheet,
  } = useTimesheetData();

  const [deptFilter, setDeptFilter] = useState<string>(
    !isManagerOrAdmin && userDepartment ? userDepartment : ''
  );
  const [statusFilter, setStatusFilter] = useState<string>('submitted');
  const [loading, setLoading] = useState(false);

  // Reject dialog state
  const [rejectingTimesheet, setRejectingTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [processingAction, setProcessingAction] = useState<boolean>(false);

  // Inspect modal state
  const [inspectingTimesheet, setInspectingTimesheet] = useState<WeeklyTimesheet | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await fetchApprovals({
        department: deptFilter || undefined,
        status: statusFilter || undefined,
      });
    } catch (err) {
      console.error('Failed to load approvals', err);
    } finally {
      setLoading(false);
    }
  }, [deptFilter, statusFilter, fetchApprovals]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (ts: WeeklyTimesheet) => {
    if (!window.confirm(`Approve timesheet for ${ts.user_name || 'worker'} (${ts.total_hours} hrs)?`)) {
      return;
    }
    try {
      setProcessingAction(true);
      await approveWeeklyTimesheet(ts.id);
      toast.success(`Timesheet approved for ${ts.user_name}`);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve timesheet';
      toast.error(msg);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingTimesheet) return;
    if (!rejectionReason.trim()) {
      toast.error('A rejection reason is required so the worker knows what to revise');
      return;
    }
    try {
      setProcessingAction(true);
      await rejectWeeklyTimesheet(rejectingTimesheet.id, rejectionReason.trim());
      toast.success(`Timesheet rejected with feedback for ${rejectingTimesheet.user_name}`);
      setRejectingTimesheet(null);
      setRejectionReason('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject timesheet';
      toast.error(msg);
    } finally {
      setProcessingAction(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--vtr-theme-surface, #1e1e1e)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: '8px',
          padding: '0.85rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', display: 'block', marginBottom: '0.25rem' }}>
              Department
            </label>
            <select
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-color, #444)',
                borderRadius: '6px',
                color: '#fff',
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
              }}
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', display: 'block', marginBottom: '0.25rem' }}>
              Status
            </label>
            <select
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-color, #444)',
                borderRadius: '6px',
                color: '#fff',
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
              }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="submitted">Submitted (Needs Review)</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="draft">Drafts</option>
              <option value="">All Statuses</option>
            </select>
          </div>
        </div>

        <button
          className={styles.btnSecondary}
          onClick={loadData}
          disabled={loading}
          type="button"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh List'}
        </button>
      </div>

      {/* Approvals Table */}
      <div
        style={{
          background: 'var(--vtr-theme-surface, #1e1e1e)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th style={{ minWidth: '150px' }}>Worker</th>
                <th style={{ minWidth: '110px' }}>Department</th>
                <th style={{ minWidth: '180px' }}>Work Week</th>
                <th style={{ minWidth: '90px', textAlign: 'right' }}>Total Hours</th>
                <th style={{ minWidth: '100px', textAlign: 'center' }}>Status</th>
                <th style={{ minWidth: '140px' }}>Submitted</th>
                <th style={{ minWidth: '180px' }}>Notes / Approver</th>
                <th style={{ minWidth: '180px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && approvals.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                    Loading timesheet approvals...
                  </td>
                </tr>
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#888' }}>
                    No timesheets matching the selected filters.
                  </td>
                </tr>
              ) : (
                approvals.map(ts => (
                  <tr key={ts.id}>
                    <td>
                      <strong>{ts.user_name || 'Unknown'}</strong>
                      {ts.user_email && (
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>{ts.user_email}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#aaa' }}>
                        {ts.department || '—'}
                      </span>
                    </td>
                    <td>
                      <strong>{formatWeekRange(ts.week_start_date)}</strong>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--vtr-theme-primary, #00e5ff)' }}>
                      {ts.total_hours.toFixed(1)} hrs
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`${styles.statusBadge} ${
                          ts.status === 'submitted'
                            ? styles.statusSubmitted
                            : ts.status === 'approved'
                            ? styles.statusApproved
                            : ts.status === 'rejected'
                            ? styles.statusRejected
                            : styles.statusDraft
                        }`}
                      >
                        {ts.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#aaa' }}>
                      {ts.submitted_at
                        ? new Date(ts.submitted_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td>
                      {ts.rejection_reason ? (
                        <span style={{ color: '#ff5252', fontSize: '0.8rem' }}>
                          Reason: {ts.rejection_reason}
                        </span>
                      ) : ts.approver_name ? (
                        <span style={{ color: '#00e676', fontSize: '0.8rem' }}>
                          Approved by {ts.approver_name}
                        </span>
                      ) : ts.notes ? (
                        <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{ts.notes}</span>
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                        {ts.status === 'submitted' && (
                          <>
                            <button
                              style={{
                                background: '#00c853',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              onClick={() => handleApprove(ts)}
                              disabled={processingAction}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              style={{
                                background: 'rgba(255, 68, 68, 0.2)',
                                color: '#ff5252',
                                border: '1px solid rgba(255, 68, 68, 0.4)',
                                borderRadius: '4px',
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              onClick={() => {
                                setRejectingTimesheet(ts);
                                setRejectionReason('');
                              }}
                              disabled={processingAction}
                              type="button"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#fff',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                          onClick={() => setInspectingTimesheet(ts)}
                          type="button"
                        >
                          Inspect Grid
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingTimesheet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 style={{ margin: 0, color: '#ff5252' }}>
              Reject Timesheet: {rejectingTimesheet.user_name}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#ccc' }}>
              Provide a clear reason for the rejection so the team member can correct their daily task
              allocations and re-submit.
            </p>
            <textarea
              style={{
                width: '100%',
                background: '#121212',
                border: '1px solid #444',
                borderRadius: '6px',
                color: '#fff',
                padding: '0.75rem',
                fontSize: '0.9rem',
                minHeight: '100px',
              }}
              placeholder="e.g. Please clarify 4.0 hours logged on Wednesday for mechanical assembly..."
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className={styles.btnSecondary}
                onClick={() => setRejectingTimesheet(null)}
                disabled={processingAction}
                type="button"
              >
                Cancel
              </button>
              <button
                style={{
                  background: '#ff5252',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.45rem 1rem',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
                onClick={handleConfirmReject}
                disabled={processingAction || !rejectionReason.trim()}
                type="button"
              >
                {processingAction ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {inspectingTimesheet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '1200px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.25rem' }}>
                Reviewing Timesheet: {inspectingTimesheet.user_name} ({formatWeekRange(inspectingTimesheet.week_start_date)})
              </h2>
              <button
                className={styles.btnSecondary}
                onClick={() => setInspectingTimesheet(null)}
                type="button"
              >
                Close ✕
              </button>
            </div>

            <WeeklyTimesheetGrid
              machines={machines}
              departmentTasks={departmentTasks}
              initialWeekStart={inspectingTimesheet.week_start_date}
              readOnlyUserView={true}
              userDepartment={inspectingTimesheet.department}
            />
          </div>
        </div>
      )}
    </div>
  );
}
