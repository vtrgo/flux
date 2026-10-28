import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import KittingHub from './page';

vi.mock('../../../components/DepartmentHub', () => ({
  DepartmentHub: ({ title }: { title: string }) => <div data-testid="department-hub">{title}</div>,
}));

vi.mock('../../../components/assembly', () => ({
  AssemblyKittingView: () => <div data-testid="assembly-kitting-view">Mock Assembly Kitting View</div>,
}));

describe('KittingHub Page', () => {
  it('renders Assembly Totes by default and allows switching to Quality Issues', async () => {
    await act(async () => {
      render(<KittingHub />);
    });

    expect(screen.getByText('Kitting Operations Hub')).toBeInTheDocument();
    expect(screen.getByTestId('assembly-kitting-view')).toBeInTheDocument();

    const issuesTab = screen.getByRole('button', { name: /Kitting Quality Issues/i });
    await act(async () => {
      fireEvent.click(issuesTab);
    });

    expect(screen.getByTestId('department-hub')).toBeInTheDocument();
    expect(screen.getByText('Kitting Quality Hub')).toBeInTheDocument();
  });
});
