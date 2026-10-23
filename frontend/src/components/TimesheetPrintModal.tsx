"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!isOpen) return null;

  const printableContent = (
    <PrintableWeeklyTimesheet
      timesheet={timesheet}
      employeeName={employeeName}
      department={department}
      weekStartDate={weekStartDate}
      rows={rows}
      totalTargetRows={totalTargetRows}
    />
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Print Weekly Timesheet"
        subtitle="Standard shop timesheet layout (Weekly Job Schedule). Spools full-page portrait directly to your printer or PDF."
        size="xl"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              Standard Letter (Portrait) &bull; Full-page uncompressed spooling enabled
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
          {printableContent}
        </div>
      </Modal>

      {/* Edge-to-edge unconstrained print target mounted directly to document.body */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <div id="timesheet-print-portal" aria-hidden="true">
          {printableContent}
        </div>,
        document.body
      )}
    </>
  );
}
