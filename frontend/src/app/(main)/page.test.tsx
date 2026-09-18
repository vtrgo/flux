import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Home from './page';
import { useDashboardData } from '../../hooks/useDashboardData';

vi.mock('../../hooks/useDashboardData');
vi.mock('../../lib/api', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('../../components/Authorize', () => ({
  Authorize: ({ children }: { children: React.ReactNode }) => <div data-testid="authorize-wrapper">{children}</div>,
}));

vi.mock('../../components/IssueModal', () => ({
  IssueModal: vi.fn(({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="issue-modal">
        <span>Mocked Issue Modal</span>
        <button onClick={onClose}>Close Issue Modal</button>
      </div>
    ) : null
  ),
}));

describe('Active Pipeline Dashboard (Home)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboardData as any).mockReturnValue({
      orders: [],
      machines: [],
      defectSummaries: [],
      projectSummaries: [],
      loading: false,
    });
  });

  it('renders Active Pipeline title and + ADD ISSUE button alongside Project Configuration', () => {
    render(<Home />);

    expect(screen.getByText('Active Pipeline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ ADD ISSUE/i })).toBeInTheDocument();
    expect(screen.getByText(/Project Configuration/i)).toBeInTheDocument();
  });

  it('opens IssueModal when + ADD ISSUE button is clicked and closes on onClose', async () => {
    render(<Home />);

    expect(screen.queryByTestId('issue-modal')).not.toBeInTheDocument();

    const addIssueBtn = screen.getByRole('button', { name: /\+ ADD ISSUE/i });
    fireEvent.click(addIssueBtn);

    expect(screen.getByTestId('issue-modal')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close Issue Modal/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('issue-modal')).not.toBeInTheDocument();
  });

  it('opens IssueModal when the "c" hotkey is pressed', async () => {
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.queryByTestId('issue-modal')).not.toBeInTheDocument();

    await user.keyboard('c');

    await waitFor(() => {
      expect(screen.getByTestId('issue-modal')).toBeInTheDocument();
    });
  });
});
