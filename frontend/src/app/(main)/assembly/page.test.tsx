import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import AssemblyHub from './page';

vi.mock('../../../components/DepartmentHub', () => ({
  DepartmentHub: ({ title }: { title: string }) => <div data-testid="department-hub">{title}</div>,
}));

vi.mock('../../../components/assembly', () => ({
  AssemblyShopHubView: () => <div data-testid="assembly-shop-view">Mock Assembly Shop View</div>,
}));

describe('AssemblyHub Page', () => {
  it('renders Assemblies by default and allows switching to Quality Issues', async () => {
    await act(async () => {
      render(<AssemblyHub />);
    });

    expect(screen.getByText('Mechanical Assembly Hub')).toBeInTheDocument();
    expect(screen.getByTestId('assembly-shop-view')).toBeInTheDocument();

    const issuesTab = screen.getByRole('button', { name: /Assembly Quality Issues/i });
    await act(async () => {
      fireEvent.click(issuesTab);
    });

    expect(screen.getByTestId('department-hub')).toBeInTheDocument();
    expect(screen.getByText('Assembly Quality Hub')).toBeInTheDocument();
  });
});
