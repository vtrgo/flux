import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import QualityResolutionHub from './page';
import { fetchApi } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';

vi.mock('../../../lib/api');
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../components/SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: () => true,
}));
vi.mock('../../../components/AttachmentViewer', () => ({
  AttachmentViewer: () => <div data-testid="attachment-viewer" />,
}));
vi.mock('../../../components/CoNCWidget', () => ({
  CoNCWidget: () => <div data-testid="conc-widget">Mock CoNC Widget</div>,
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

describe('QualityResolutionHub Component', () => {
  const mockDefects = [
    {
      id: 'defect-1',
      machine_id: 'm-1',
      order_number: 'VTR-1001',
      description: 'Loose motor mount bolts',
      severity: 'critical',
      status: 'open',
      source_department: 'quality',
      assigned_department: 'assembly',
      created_at: '2026-09-22T10:00:00Z',
      label: 'Defect',
    },
    {
      id: 'defect-2',
      machine_id: 'm-1',
      order_number: 'VTR-1001',
      description: 'Re-torqued and verified mounting bracket',
      severity: 'moderate',
      status: 'fixed',
      source_department: 'assembly',
      assigned_department: 'quality',
      created_at: '2026-09-22T11:00:00Z',
      label: 'Defect',
    },
    {
      id: 'defect-3',
      machine_id: 'm-2',
      order_number: 'VTR-1002',
      description: 'Vendor fastener pitch variance noted for future machine builds',
      notes: 'Informational finding; no action required on current unit',
      severity: 'minor',
      status: 'verified',
      source_department: 'assembly',
      assigned_department: 'assembly',
      created_at: '2026-09-22T12:00:00Z',
      resolved_at: '2026-09-22T12:00:00Z',
      resolved_by: 'John Inspector',
      label: 'General',
    },
  ];

  const mockMachines = [
    { id: 'm-1', order_number: 'VTR-1001', model_type: 'Model X', status: 'assembly' },
    { id: 'm-2', order_number: 'VTR-1002', model_type: 'Model Y', status: 'testing' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: 'u-1', username: 'tech', role: 'technician' },
      isAdmin: false,
      hasRole: vi.fn().mockReturnValue(false),
      hasDepartment: vi.fn().mockReturnValue(false),
    });
    (fetchApi as any).mockImplementation((endpoint: string) => {
      if (endpoint === 'defects') return Promise.resolve(mockDefects);
      if (endpoint === 'machines') return Promise.resolve(mockMachines);
      return Promise.resolve([]);
    });
  });

  it('renders Quality Hub with general closed issue in Signed Off / Cleared column with GENERAL badge', async () => {
    await act(async () => {
      render(<QualityResolutionHub />);
    });

    expect(screen.getByText('Quality / PM Hub')).toBeInTheDocument();
    expect(screen.getByText('Loose motor mount bolts')).toBeInTheDocument();
    expect(screen.getByText('Vendor fastener pitch variance noted for future machine builds')).toBeInTheDocument();
    expect(screen.getByText('GENERAL')).toBeInTheDocument();
  });

  it('filters issues by classification type (Actionable vs General Issues)', async () => {
    await act(async () => {
      render(<QualityResolutionHub />);
    });

    // Both are initially present
    expect(screen.getByText('Loose motor mount bolts')).toBeInTheDocument();
    expect(screen.getByText('Vendor fastener pitch variance noted for future machine builds')).toBeInTheDocument();

    // Click "General Issues" filter button
    const generalFilterBtn = screen.getByRole('radio', { name: /^General Issues$/i });
    await act(async () => {
      fireEvent.click(generalFilterBtn);
    });

    // Actionable defect should be filtered out, General issue remains
    expect(screen.queryByText('Loose motor mount bolts')).not.toBeInTheDocument();
    expect(screen.getByText('Vendor fastener pitch variance noted for future machine builds')).toBeInTheDocument();

    // Click "Actionable" filter button
    const actionableFilterBtn = screen.getByRole('radio', { name: /^Actionable$/i });
    await act(async () => {
      fireEvent.click(actionableFilterBtn);
    });

    // Actionable defects should now be visible, General issue filtered out
    expect(screen.getByText('Loose motor mount bolts')).toBeInTheDocument();
    expect(screen.queryByText('Vendor fastener pitch variance noted for future machine builds')).not.toBeInTheDocument();
  });

  it('hides CoNC widget and toggle button completely for non-admin users', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u-1', username: 'tech', role: 'technician' },
      isAdmin: false,
      hasRole: vi.fn().mockReturnValue(false),
      hasDepartment: vi.fn().mockReturnValue(false),
    });

    await act(async () => {
      render(<QualityResolutionHub />);
    });

    expect(screen.queryByTestId('conc-widget')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conc metrics/i })).not.toBeInTheDocument();
  });

  it('defaults to hiding CoNC metrics for admins with toggle button available to show/hide', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
      isAdmin: true,
      hasRole: vi.fn().mockReturnValue(true),
      hasDepartment: vi.fn().mockReturnValue(true),
    });

    await act(async () => {
      render(<QualityResolutionHub />);
    });

    // Hidden by default
    expect(screen.queryByTestId('conc-widget')).not.toBeInTheDocument();

    // Toggle button is available
    const toggleBtn = screen.getByRole('button', { name: /conc metrics/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn.textContent).toContain('CoNC Metrics');

    // Admin clicks to show CoNC metrics
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.getByTestId('conc-widget')).toBeInTheDocument();
    expect(toggleBtn.textContent).toContain('Hide CoNC Metrics');

    // Admin clicks again to hide CoNC metrics
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.queryByTestId('conc-widget')).not.toBeInTheDocument();
    expect(toggleBtn.textContent).toContain('CoNC Metrics');
  });
});
