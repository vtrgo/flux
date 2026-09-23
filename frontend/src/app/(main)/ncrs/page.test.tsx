import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import NCRTrackerPage from './page';
import { fetchApi } from '../../../lib/api';

vi.mock('../../../lib/api');
vi.mock('../../../components/SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: () => true,
}));
vi.mock('../../../components/AttachmentViewer', () => ({
  AttachmentViewer: () => <div data-testid="attachment-viewer" />
}));
vi.mock('../../../components/ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  }
}));

describe('NCRTrackerPage', () => {
  const mockNCRs = [
    {
      id: 'ncr-1',
      machine_id: 'm-1',
      order_number: 'VTR-1001',
      internal_project_number: 'PRJ-88',
      is_ncr: true,
      ncr_number: 'NCR-2026-001',
      assembler: 'Bob Builder',
      location: 'Station 1 - Feed Track',
      description: 'Misaligned track rail 2mm',
      severity: 'moderate',
      status: 'open',
      source_department: 'quality',
      assigned_department: 'assembly',
      created_at: '2026-09-22T10:00:00Z',
    },
    {
      id: 'ncr-2',
      machine_id: 'm-2',
      order_number: 'VTR-1002',
      internal_project_number: 'PRJ-90',
      is_ncr: true,
      ncr_number: 'NCR-2026-002',
      assembler: 'Alice Assembler',
      location: 'Station 4 - Bowl Mount',
      description: 'Bolt hole stripped on bracket',
      severity: 'critical',
      status: 'verified',
      source_department: 'quality',
      assigned_department: 'assembly',
      created_at: '2026-09-21T09:00:00Z',
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchApi as any).mockImplementation((url: string) => {
      if (url === 'ncrs') {
        return Promise.resolve(mockNCRs);
      }
      if (url === 'machines') {
        return Promise.resolve([
          { id: 'm-1', order_number: 'VTR-1001', model_type: 'Model A' },
          { id: 'm-2', order_number: 'VTR-1002', model_type: 'Model B' }
        ]);
      }
      if (url === 'ncrs/next-number') {
        return Promise.resolve({ next_number: 'NCR-2026-003' });
      }
      return Promise.resolve(null);
    });
  });

  it('renders NCR tracker title, metrics, and cards', async () => {
    await act(async () => {
      render(<NCRTrackerPage />);
    });

    expect(screen.getByText(/Non-Conformance Reports \(NCR\)/i)).toBeDefined();
    expect(screen.getByText(/Total NCRs Logged/i)).toBeDefined();
    expect(screen.getByText(/NCR-2026-001/i)).toBeDefined();
    expect(screen.getByText(/NCR-2026-002/i)).toBeDefined();
    expect(screen.getByText(/Misaligned track rail 2mm/i)).toBeDefined();
  });

  it('toggles between cards view and table view', async () => {
    await act(async () => {
      render(<NCRTrackerPage />);
    });

    const toggleBtn = screen.getByRole('button', { name: /Table View/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.getByText(/Cards View/i)).toBeDefined();
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByText('Station 1 - Feed Track')).toBeDefined();
  });

  it('opens NCR creation modal when button is clicked', async () => {
    await act(async () => {
      render(<NCRTrackerPage />);
    });

    const createBtn = screen.getByRole('button', { name: /\+ CREATE NCR/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByText(/Fabricated Components/i)).toBeDefined();
    expect(screen.getByLabelText(/NCR Identification #/i)).toBeDefined();
  });

  it('marks summary details for NCR counts with no-print so they do not print', async () => {
    let containerElement: HTMLElement;
    await act(async () => {
      const { container } = render(<NCRTrackerPage />);
      containerElement = container;
    });

    // Check that summary details for NCR counts (metricsGrid) has no-print
    const metricsGrid = containerElement!.querySelector('section[class*="metricsGrid"]');
    expect(metricsGrid).toBeDefined();
    expect(metricsGrid?.className).toContain('no-print');

    // Check that header and controls also have no-print
    const header = containerElement!.querySelector('header');
    expect(header?.className).toContain('no-print');

    const controls = containerElement!.querySelector('section[class*="controls"]');
    expect(controls?.className).toContain('no-print');
  });
});

