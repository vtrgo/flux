"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { WeeklyTimesheet, Machine, DepartmentTask } from '../types';
import { getSundayOfWeek, addWeeks, formatWeekRange, formatHours } from '../lib/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { WeeklyTimesheetGrid } from './WeeklyTimesheetGrid';
import { Modal } from './ui/Modal';
import styles from './WeeklyTimesheetGrid.module.css';

interface TimesheetApprovalsTableProps {
  userDepartment?: string;
  isManagerOrAdmin: boolean;
  isAdmin?: boolean;
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
  isAdmin: propsIsAdmin,
  machines,
  departmentTasks,
}: TimesheetApprovalsTableProps) {
  const { isAdmin: authIsAdmin } = useAuth();
  const isAdminUser = Boolean(propsIsAdmin ?? authIsAdmin);

  const {
    approvals,
    fetchApprovals,
    approveWeeklyTimesheet,
    rejectWeeklyTimesheet,
    deleteWeeklyTimesheet,
  } = useTimesheetData();

  // Work week filter state: defaults to current work week Sunday
  const [selectedWeek, setSelectedWeek] = useState<string>(() => getSundayOfWeek());
  const [deptFilter, setDeptFilter] = useState<string>(
    !isManagerOrAdmin && userDepartment ? userDepartment : ''
  );
  const [loading, setLoading] = useState(false);

  // Reject dialog state
  const [rejectingTimesheet, setRejectingTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [processingAction, setProcessingAction] = useState<boolean>(false);

  // Expanded inline child row state
  const [expandedTimesheet, setExpandedTimesheet] = useState<WeeklyTimesheet | null>(null);

  const isCurrentWeek = useMemo(
    () => selectedWeek === getSundayOfWeek(),
    [selectedWeek]
  );

  const handlePrevWeek = () => {
    setSelectedWeek(prev => addWeeks(prev || getSundayOfWeek(), -1));
  };

  const handleNextWeek = () => {
    setSelectedWeek(prev => addWeeks(prev || getSundayOfWeek(), 1));
  };

  const handleThisWeek = () => {
    setSelectedWeek(getSundayOfWeek());
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await fetchApprovals({
        department: deptFilter || undefined,
        week_start: selectedWeek || undefined,
      });
    } catch (err) {
      console.error('Failed to load approvals', err);
    } finally {
      setLoading(false);
    }
  }, [deptFilter, selectedWeek, fetchApprovals]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setExpandedTimesheet(null);
  }, [selectedWeek, deptFilter]);

  const handleApprove = async (ts: WeeklyTimesheet) => {
    if (!window.confirm(`Approve timesheet for ${ts.user_name || 'worker'} (${formatHours(ts.total_hours)} hrs)?`)) {
      return;
    }
    try {
      setProcessingAction(true);
      await approveWeeklyTimesheet(ts.id);
      toast.success('Timesheet Approved');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve timesheet';
      toast.error(msg);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleDeleteTimesheet = async (ts: WeeklyTimesheet) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the timesheet for ${ts.user_name || 'worker'} (${formatWeekRange(ts.week_start_date)})? This will permanently remove all associated time entries.`
      )
    ) {
      return;
    }
    try {
      setProcessingAction(true);
      await deleteWeeklyTimesheet(ts.id);
      toast.success('Timesheet deleted');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete timesheet';
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
      {/* Work Week Navigation Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className={styles.navBtn}
            onClick={handlePrevWeek}
            title="Previous Work Week"
            type="button"
          >
            ◀ Prev Week
          </button>
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#fff',
              minWidth: '220px',
              textAlign: 'center',
            }}
          >
            📅 {selectedWeek ? formatWeekRange(selectedWeek) : 'All Work Weeks'}
          </span>
          <button
            className={styles.navBtn}
            onClick={handleNextWeek}
            title="Next Work Week"
            type="button"
          >
            Next Week ▶
          </button>
          {!isCurrentWeek && (
            <button
              className={styles.navBtn}
              onClick={handleThisWeek}
              title="Jump to Current Work Week"
              type="button"
              style={{ marginLeft: '0.25rem' }}
            >
              Today / Current Week
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label
              htmlFor="dept-filter-select"
              style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', whiteSpace: 'nowrap' }}
            >
              Department:
            </label>
            <select
              id="dept-filter-select"
              aria-label="Department"
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

          <button
            className={styles.btnSecondary}
            onClick={loadData}
            disabled={loading}
            type="button"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
            title="Refresh approvals list"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh List'}
          </button>
        </div>
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
                <th style={{ minWidth: '160px' }}>Worker</th>
                <th style={{ minWidth: '120px' }}>Department</th>
                <th style={{ minWidth: '90px', textAlign: 'right' }}>Total Hours</th>
                <th style={{ minWidth: '100px', textAlign: 'center' }}>Status</th>
                <th style={{ minWidth: '140px' }}>Saved / Updated</th>
                <th style={{ minWidth: '220px' }}>Notes / Approver</th>
                <th style={{ minWidth: '180px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && approvals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#888' }}>
                    Loading timesheet approvals for {selectedWeek ? formatWeekRange(selectedWeek) : 'all work weeks'}...
                  </td>
                </tr>
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#888' }}>
                    <div style={{ color: '#ccc' }}>
                      No timesheets found for {selectedWeek ? `work week ${formatWeekRange(selectedWeek)}` : 'the selected filters'}.
                    </div>
                    {selectedWeek && (
                      <button
                        className={styles.btnSecondary}
                        onClick={() => setSelectedWeek('')}
                        style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}
                        type="button"
                      >
                        View All Work Weeks
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                approvals.map(ts => {
                  const isExpanded = expandedTimesheet?.id === ts.id;
                  return (
                    <React.Fragment key={ts.id}>
                      <tr
                        style={
                          isExpanded
                            ? { background: 'rgba(0, 229, 255, 0.05)', borderLeft: '3px solid var(--vtr-theme-primary, #00e5ff)' }
                            : undefined
                        }
                      >
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
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--vtr-theme-primary, #00e5ff)' }}>
                          {formatHours(ts.total_hours)} hrs
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`${styles.statusBadge} ${
                              ts.status === 'approved'
                                ? styles.statusApproved
                                : ts.status === 'rejected'
                                ? styles.statusRejected
                                : ts.total_hours > 0
                                ? styles.statusSubmitted
                                : styles.statusDraft
                            }`}
                          >
                            {ts.status === 'approved'
                              ? 'APPROVED'
                              : ts.status === 'rejected'
                              ? 'REJECTED'
                              : ts.total_hours > 0
                              ? 'PENDING'
                              : 'DRAFT'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#aaa' }}>
                          {ts.updated_at || ts.submitted_at || ts.created_at
                            ? new Date(ts.updated_at || ts.submitted_at || ts.created_at).toLocaleDateString(undefined, {
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
                            {ts.status !== 'approved' && (
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
                                    cursor: ts.total_hours > 0 ? 'pointer' : 'not-allowed',
                                    opacity: ts.total_hours > 0 ? 1 : 0.5,
                                  }}
                                  onClick={() => handleApprove(ts)}
                                  disabled={processingAction || ts.total_hours <= 0}
                                  title={ts.total_hours > 0 ? 'Approve timesheet hours' : 'Cannot approve timesheet with 0 hours'}
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
                                    cursor: ts.total_hours > 0 ? 'pointer' : 'not-allowed',
                                    opacity: ts.total_hours > 0 ? 1 : 0.5,
                                  }}
                                  onClick={() => {
                                    setRejectingTimesheet(ts);
                                    setRejectionReason('');
                                  }}
                                  disabled={processingAction || ts.total_hours <= 0}
                                  type="button"
                                  title="Reject and request revisions"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {ts.status === 'approved' && (
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
                                title="Revoke approval and request revisions"
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              style={{
                                background: isExpanded ? 'var(--vtr-theme-primary, #00e5ff)' : 'rgba(255, 255, 255, 0.08)',
                                color: isExpanded ? '#000' : '#fff',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: isExpanded ? 700 : 400,
                                cursor: 'pointer',
                              }}
                              onClick={() => setExpandedTimesheet(isExpanded ? null : ts)}
                              type="button"
                            >
                              {isExpanded ? 'Hide Details' : 'Review'}
                            </button>
                            {isAdminUser && (
                              <button
                                style={{
                                  background: 'rgba(255, 68, 68, 0.1)',
                                  color: '#ff5252',
                                  border: '1px solid rgba(255, 68, 68, 0.3)',
                                  borderRadius: '4px',
                                  padding: '0.3rem 0.6rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleDeleteTimesheet(ts)}
                                disabled={processingAction}
                                type="button"
                                title="Delete timesheet and associated entries (Admin only)"
                              >
                                🗑️ Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${ts.id}-details`}>
                          <td
                            colSpan={7}
                            style={{
                              padding: '1rem 1.25rem',
                              background: '#151515',
                              borderTop: '1px solid rgba(0, 229, 255, 0.3)',
                              borderBottom: '2px solid #333',
                            }}
                          >
                            {/* Worker Comments / Remarks */}
                            <div
                              style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '0.65rem 0.9rem',
                                marginBottom: '0.85rem',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: 'var(--vtr-theme-primary, #00e5ff)',
                                  textTransform: 'uppercase',
                                  marginBottom: '0.25rem',
                                  letterSpacing: '0.5px',
                                }}
                              >
                                💬 Worker Comments:
                              </div>
                              <div
                                style={{
                                  color: ts.notes ? '#fff' : '#888',
                                  fontSize: '0.85rem',
                                  fontStyle: ts.notes ? 'normal' : 'italic',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {ts.notes ? ts.notes : 'No worker comments entered for this work week.'}
                              </div>
                            </div>

                            {/* Prior Rejection Reason if any */}
                            {ts.rejection_reason && (
                              <div
                                style={{
                                  background: 'rgba(255, 82, 82, 0.1)',
                                  border: '1px solid rgba(255, 82, 82, 0.3)',
                                  borderRadius: '6px',
                                  padding: '0.65rem 0.9rem',
                                  marginBottom: '0.85rem',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#ff5252',
                                    textTransform: 'uppercase',
                                    marginBottom: '0.25rem',
                                  }}
                                >
                                  ⚠️ Previous Rejection Reason:
                                </div>
                                <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                                  {ts.rejection_reason}
                                </div>
                              </div>
                            )}

                            {/* Task/Machine Daily Hours Breakdown */}
                            <WeeklyTimesheetGrid
                              machines={machines}
                              departmentTasks={departmentTasks}
                              initialWeekStart={ts.week_start_date}
                              readOnlyUserView={true}
                              userDepartment={ts.department}
                              targetUserId={ts.user_id}
                              hideDateNav={true}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={Boolean(rejectingTimesheet)}
        onClose={() => setRejectingTimesheet(null)}
        title={`Reject Timesheet: ${rejectingTimesheet?.user_name || ''}`}
        subtitle="Provide a clear reason for the rejection so the team member can correct their daily task allocations and re-submit."
        size="sm"
        footer={
          <>
            <button
              className="vtr-btn vtr-btn-secondary"
              onClick={() => setRejectingTimesheet(null)}
              disabled={processingAction}
              type="button"
            >
              Cancel
            </button>
            <button
              className="vtr-btn"
              style={{
                backgroundColor: 'var(--color-danger, #ff5252)',
                borderColor: 'var(--color-danger, #ff5252)',
                color: '#fff',
              }}
              onClick={handleConfirmReject}
              disabled={processingAction || !rejectionReason.trim()}
              type="button"
            >
              {processingAction ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </>
        }
      >
        <textarea
          style={{
            width: '100%',
            background: 'var(--surface-base, #121212)',
            border: '1px solid var(--border-default, #333)',
            borderRadius: 'var(--radius-sm, 4px)',
            color: 'var(--text-primary, #fff)',
            padding: '0.75rem',
            fontSize: '0.9rem',
            minHeight: '100px',
            fontFamily: 'var(--font-mono)',
          }}
          placeholder="e.g. Please clarify 4.0 hours logged on Wednesday for mechanical assembly..."
          value={rejectionReason}
          onChange={e => setRejectionReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
