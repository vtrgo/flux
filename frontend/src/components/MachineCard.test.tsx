import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MachineCard } from './MachineCard';
import { fetchApi } from '../lib/api';
import { Machine, DefectSummary, MachineFATReadinessResponse } from '../types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../lib/api', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: vi.fn().mockReturnValue(true),
}));

vi.mock('../contexts/DateTimeContext', () => ({
  useDateTime: () => ({ timezone: 'UTC' }),
}));

vi.mock('./Authorize', () => ({
  Authorize: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('MachineCard Component', () => {
  const mockMachine: Machine = {
    id: 'm-100',
    sales_order_id: 'so-100',
    order_number: 'M-5000',
    model_type: 'Rotary Dial Assembly Machine',
    status: 'assembly',
    fat_date: '2026-11-15T00:00:00Z',
    lead: 'Alex R.',
    created_at: '2026-10-01T00:00:00Z',
    created_by_user_name: 'LeadEng',
  };

  const mockDefectSummaries: DefectSummary[] = [
    {
      machine_id: 'm-100',
      assigned_department: 'assembly',
      total: 3,
      open_critical: 0,
      open_moderate: 1,
      open_minor: 0,
      pending_critical: 0,
      pending_moderate: 0,
      pending_minor: 0,
      closed: 2,
      total_open: 1,
      total_pending: 0,
    },
  ];

  const readyResponse: MachineFATReadinessResponse = {
    machine_id: 'm-100',
    can_proceed: true,
    open_issues: 0,
    open_ncrs: 0,
    active_rework: 0,
    blockers: [],
  };

  const blockedResponse: MachineFATReadinessResponse = {
    machine_id: 'm-100',
    can_proceed: false,
    open_issues: 2,
    open_ncrs: 1,
    active_rework: 1,
    blockers: [
      '2 unverified defect(s) pending resolution',
      '1 active Non-Conformance Report(s) awaiting closeout signature',
      '1 active rework item(s) currently in progress or post-processing',
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders machine order number, model, lead, and FAT readiness shield when blocked', async () => {
    (fetchApi as any).mockResolvedValue(blockedResponse);

    await act(async () => {
      render(
        <MachineCard
          machine={mockMachine}
          defectSummaries={mockDefectSummaries}
          onDelete={vi.fn()}
          onSelectDept={vi.fn()}
        />
      );
    });

    expect(screen.getByText('M-5000')).toBeInTheDocument();
    expect(screen.getByText('Rotary Dial Assembly Machine')).toBeInTheDocument();
    expect(screen.getByText('Alex R.')).toBeInTheDocument();

    // Verify FAT Readiness Shield displays BLOCKED state with 3 blockers
    const shieldBtn = screen.getByLabelText('FAT Readiness Status');
    expect(shieldBtn).toBeInTheDocument();
    expect(shieldBtn.textContent).toContain('FAT BLOCKED');
    expect(shieldBtn.textContent).toContain('3 QUALITY BLOCKERS');
  });

  it('renders FAT READY shield when all quality inspections and rework orders are clear', async () => {
    (fetchApi as any).mockResolvedValue(readyResponse);

    await act(async () => {
      render(
        <MachineCard
          machine={mockMachine}
          defectSummaries={mockDefectSummaries}
          onDelete={vi.fn()}
          onSelectDept={vi.fn()}
        />
      );
    });

    const shieldBtn = screen.getByLabelText('FAT Readiness Status');
    expect(shieldBtn).toBeInTheDocument();
    expect(shieldBtn.textContent).toContain('FAT READY');
    expect(shieldBtn.textContent).toContain('ALL SOP GATES PASSED');
  });

  it('toggles interactive blocker breakdown popover on shield button click', async () => {
    (fetchApi as any).mockResolvedValue(blockedResponse);

    await act(async () => {
      render(
        <MachineCard
          machine={mockMachine}
          defectSummaries={mockDefectSummaries}
          onDelete={vi.fn()}
          onSelectDept={vi.fn()}
        />
      );
    });

    // Popover is initially closed
    expect(screen.queryByText(/Pre-FAT Quality Blockers:/i)).not.toBeInTheDocument();

    // Click shield to open popover
    const shieldBtn = screen.getByLabelText('FAT Readiness Status');
    await act(async () => {
      fireEvent.click(shieldBtn);
    });

    // Popover elements should now be visible
    expect(screen.getByText(/FAT Readiness: M-5000/i)).toBeInTheDocument();
    expect(screen.getByText(/Blocked by Quality & Rework SOP Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Pre-FAT Quality Blockers:/i)).toBeInTheDocument();
    expect(screen.getByText(/2 unverified defect\(s\) pending resolution/i)).toBeInTheDocument();
    expect(screen.getByText(/1 active Non-Conformance Report\(s\) awaiting closeout signature/i)).toBeInTheDocument();
    expect(screen.getByText(/1 active rework item\(s\) currently in progress/i)).toBeInTheDocument();

    // Quick links for Rework and NCR hubs
    expect(screen.getByText(/Open Rework Orders/i)).toBeInTheDocument();
    expect(screen.getByText(/Review Active NCRs/i)).toBeInTheDocument();

    // Close button dismisses popover
    const closeBtn = screen.getByLabelText('Close Popover');
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByText(/Pre-FAT Quality Blockers:/i)).not.toBeInTheDocument();
  });
});
