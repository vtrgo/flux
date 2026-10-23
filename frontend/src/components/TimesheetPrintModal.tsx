"use client";

import React, { useCallback } from 'react';
import { Modal } from './ui/Modal';
import { PrintableWeeklyTimesheet, PrintableTimesheetRow } from './PrintableWeeklyTimesheet';
import { WeeklyTimesheet } from '../types';

export interface TimesheetPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  timesheet?: WeeklyTimesheet | null;
  employeeName?: string;
  department?: string;
  weekStartDate: string; // ISO Sunday
  rows?: PrintableTimesheetRow[];
  totalTargetRows?: number;
}

export function TimesheetPrintModal({
  isOpen,
  onClose,
  timesheet,
  employeeName,
  department,
  weekStartDate,
  rows,
  totalTargetRows = 18,
}: TimesheetPrintModalProps) {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Weekly Timesheet"
      subtitle="Standard shop timesheet layout (Weekly Job Schedule). Print to paper or save as PDF for management review and physical routing."
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>
            Tip: Use standard Letter paper in Portrait orientation.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="vtr-btn vtr-btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="vtr-btn vtr-btn-primary"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: 'var(--vtr-theme-primary, #00e5ff)',
                color: '#000',
                fontWeight: 700,
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>🖨️</span>
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '0.5rem' }}>
        <PrintableWeeklyTimesheet
          timesheet={timesheet}
          employeeName={employeeName}
          department={department}
          weekStartDate={weekStartDate}
          rows={rows}
          totalTargetRows={totalTargetRows}
        />
      </div>
    </Modal>
  );
}
