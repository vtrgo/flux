"use client";

import React, { useCallback } from 'react';
import { Modal } from './ui/Modal';
import { PrintableWeeklyTimesheet, PrintableTimesheetRow, buildTimesheetPrintParams } from './PrintableWeeklyTimesheet';
import { generateTimesheetHtml, printTimesheetDocument } from '../lib/printTimesheet';
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
  notes?: string;
}

export function TimesheetPrintModal({
  isOpen,
  onClose,
  timesheet,
  employeeName,
  department,
  weekStartDate,
  rows,
  totalTargetRows = 10,
  notes,
}: TimesheetPrintModalProps) {
  const handlePrint = useCallback(() => {
    const params = buildTimesheetPrintParams(
      timesheet,
      employeeName,
      department,
      weekStartDate,
      rows,
      totalTargetRows,
      notes || timesheet?.notes
    );
    const html = generateTimesheetHtml(params);
    printTimesheetDocument(html);
  }, [timesheet, employeeName, department, weekStartDate, rows, totalTargetRows, notes]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Weekly Timesheet"
      subtitle="Standard shop timesheet layout (Weekly Job Schedule). Spools full-page landscape directly to your printer or PDF."
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>
            Standard Letter (Landscape) &bull; Isolated print spooling enabled
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
          notes={notes || timesheet?.notes}
        />
      </div>
    </Modal>
  );
}
