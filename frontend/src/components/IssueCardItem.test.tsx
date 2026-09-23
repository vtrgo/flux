import { describe, it, expect, vi } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { IssueCardItem } from './IssueCardItem';
import { Defect } from '../types';

vi.mock('../lib/api', () => ({
  fetchApi: vi.fn().mockResolvedValue([])
}));

vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: vi.fn().mockReturnValue(true)
}));

describe('IssueCardItem Component', () => {
  const baseDefect: Defect = {
    id: 'defect-item-1',
    machine_id: 'machine-item-1',
    order_number: 'ORD-ITEM-1',
    source_department: 'quality',
    assigned_department: 'assembly',
    description: 'Bolt loose on linear guide',
    severity: 'critical',
    status: 'open',
    created_at: '2026-09-01T10:00:00Z',
  };

  it('renders open defect with MARK FIXED and delete actions, triggering stable callbacks', async () => {
    const onCardClick = vi.fn();
    const onStatusChange = vi.fn();
    const onDelete = vi.fn();

    await act(async () => {
      render(
        <IssueCardItem
          issue={baseDefect}
          onCardClick={onCardClick}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      );
    });

    expect(screen.getByText('ORD-ITEM-1')).toBeDefined();
    expect(screen.getByText('Bolt loose on linear guide')).toBeDefined();

    const markFixedBtn = screen.getByRole('button', { name: /MARK FIXED/i });
    fireEvent.click(markFixedBtn);
    expect(onStatusChange).toHaveBeenCalledWith(expect.anything(), baseDefect, 'fixed');

    const deleteBtn = screen.getByRole('button', { name: /🗑️/i });
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(expect.anything(), 'defect-item-1');
  });

  it('renders fixed defect with SIGN OFF and REJECT actions', async () => {
    const fixedDefect: Defect = {
      ...baseDefect,
      status: 'fixed',
      resolved_at: '2026-09-01T12:00:00Z',
    };

    const onCardClick = vi.fn();
    const onStatusChange = vi.fn();
    const onDelete = vi.fn();

    await act(async () => {
      render(
        <IssueCardItem
          issue={fixedDefect}
          onCardClick={onCardClick}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      );
    });

    const signOffBtn = screen.getByRole('button', { name: /SIGN OFF/i });
    fireEvent.click(signOffBtn);
    expect(onStatusChange).toHaveBeenCalledWith(expect.anything(), fixedDefect, 'verified');

    const rejectBtn = screen.getByRole('button', { name: /REJECT/i });
    fireEvent.click(rejectBtn);
    expect(onStatusChange).toHaveBeenCalledWith(expect.anything(), fixedDefect, 'open');
  });

  it('renders verified defect with RE-OPEN action', async () => {
    const verifiedDefect: Defect = {
      ...baseDefect,
      status: 'verified',
      resolved_at: '2026-09-01T14:00:00Z',
    };

    const onCardClick = vi.fn();
    const onStatusChange = vi.fn();
    const onDelete = vi.fn();

    await act(async () => {
      render(
        <IssueCardItem
          issue={verifiedDefect}
          onCardClick={onCardClick}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      );
    });

    const reopenBtn = screen.getByRole('button', { name: /RE-OPEN/i });
    fireEvent.click(reopenBtn);
    expect(onStatusChange).toHaveBeenCalledWith(expect.anything(), verifiedDefect, 'open');
  });
});
