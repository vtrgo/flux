import { describe, it, expect, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { IssueCard } from './IssueCard';
import { Defect } from '../types';

vi.mock('../lib/api', () => ({
  fetchApi: vi.fn().mockResolvedValue([])
}));

vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: vi.fn().mockReturnValue(true)
}));

describe('IssueCard Component', () => {
  const baseIssue: Defect = {
    id: 'defect-123',
    machine_id: 'machine-456',
    order_number: 'ORD-789',
    source_department: 'quality',
    assigned_department: 'assembly',
    description: 'Misaligned bracket on station 2',
    severity: 'moderate',
    status: 'open',
    created_at: '2026-08-25T14:30:00Z',
  };

  it('renders issue details and opened timestamp for open issues', async () => {
    await act(async () => {
      render(
        <IssueCard
          issue={baseIssue}
          onClick={() => {}}
          actions={<button>Action</button>}
        />
      );
    });

    expect(screen.getByText('ORD-789')).toBeDefined();
    expect(screen.getByText('moderate')).toBeDefined();
    expect(screen.getByText('Misaligned bracket on station 2')).toBeDefined();
    expect(screen.getByText('Opened:')).toBeDefined();
    expect(screen.queryByText('Closed:')).toBeNull();
  });

  it('renders closed timestamp when issue is fixed or verified', async () => {
    const fixedIssue: Defect = {
      ...baseIssue,
      status: 'fixed',
      resolved_at: '2026-08-25T16:45:00Z',
    };

    await act(async () => {
      render(
        <IssueCard
          issue={fixedIssue}
          onClick={() => {}}
          actions={<button>Sign Off</button>}
        />
      );
    });

    expect(screen.getByText('Opened:')).toBeDefined();
    expect(screen.getByText('Fixed:')).toBeDefined();
  });

  it('does not render closed timestamp when issue is reopened (status is open)', async () => {
    const reopenedIssue: Defect = {
      ...baseIssue,
      status: 'open',
      resolved_at: undefined,
    };

    await act(async () => {
      render(
        <IssueCard
          issue={reopenedIssue}
          onClick={() => {}}
          actions={<button>Mark Fixed</button>}
        />
      );
    });

    expect(screen.getByText('Opened:')).toBeDefined();
    expect(screen.queryByText('Closed:')).toBeNull();
  });
});
