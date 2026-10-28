import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import MachineDetail from './page';
import { fetchApi } from '../../../lib/api';

let mockSearchParams: Record<string, string | null> = { id: 'mach-1' };

vi.mock('../../../lib/api');
vi.mock('../../../components/SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: () => true,
}));
vi.mock('../../../contexts/DateTimeContext', () => ({
  useDateTime: () => ({ timezone: 'UTC' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams[key] ?? null,
  }),
}));
vi.mock('../../../components/AttachmentViewer', () => ({
  AttachmentViewer: () => <div data-testid="attachment-viewer" />,
}));
vi.mock('../../../components/IssueModal', () => ({
  IssueModal: () => <div data-testid="issue-modal" />,
}));
vi.mock('../../../components/assembly', () => ({
  AssemblyTreeBuilder: ({ machineId, orderNumber }: { machineId: string; orderNumber: string }) => (
    <div data-testid="assembly-tree-builder">
      Assembly Tree for {orderNumber} ({machineId})
    </div>
  ),
  BOMImportModal: () => <div data-testid="bom-import-modal" />,
}));

describe('MachineDetail Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders machine header and switches tabs to assembly tree builder', async () => {
    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url === 'machines/mach-1') {
        return {
          id: 'mach-1',
          order_number: 'VTR-9999',
          model_type: 'Cartoner Pro',
          lead: 'John Doe',
          fat_date: '2026-11-01',
          sales_order_id: 'so-1',
        };
      }
      if (url === 'machines/mach-1/defects') {
        return [
          {
            id: 'def-1',
            machine_id: 'mach-1',
            description: 'Misaligned sensor bracket',
            status: 'open',
            severity: 'moderate',
            assigned_department: 'assembly',
          },
        ];
      }
      if (url === 'sales_orders/so-1') {
        return {
          id: 'so-1',
          customer_name: 'Acme Corp',
          po_number: 'PO-12345',
        };
      }
      return null;
    });

    await act(async () => {
      render(<MachineDetail />);
    });

    // Check header info
    expect(screen.getByRole('heading', { level: 1, name: 'VTR-9999' })).toBeInTheDocument();
    expect(screen.getByText('Cartoner Pro - Project Portal')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();

    // Default tab is Quality Issues
    expect(screen.getByText('Open Issues')).toBeInTheDocument();
    expect(screen.getByText('Misaligned sensor bracket')).toBeInTheDocument();

    // Click Assemblies tab
    const assembliesTab = screen.getByRole('button', { name: /Assembly Hierarchy & BOM/i });
    expect(assembliesTab).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(assembliesTab);
    });

    // Verify AssemblyTreeBuilder is rendered
    expect(screen.getByTestId('assembly-tree-builder')).toBeInTheDocument();
    expect(screen.getByText('Assembly Tree for VTR-9999 (mach-1)')).toBeInTheDocument();
  });

  it('automatically opens defect inspection modal when defect_id is provided in URL params', async () => {
    mockSearchParams = { id: 'mach-1', defect_id: 'def-1' };

    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url === 'machines/mach-1') {
        return {
          id: 'mach-1',
          order_number: 'VTR-9999',
          model_type: 'Cartoner Pro',
          fat_date: '2026-11-01',
        };
      }
      if (url === 'machines/mach-1/defects') {
        return [
          {
            id: 'def-1',
            machine_id: 'mach-1',
            description: 'Misaligned sensor bracket',
            status: 'open',
            severity: 'moderate',
            assigned_department: 'assembly',
          },
        ];
      }
      return null;
    });

    await act(async () => {
      render(<MachineDetail />);
    });

    // Verify the issue modal is rendered due to defect_id deep link
    expect(screen.getByTestId('issue-modal')).toBeInTheDocument();
  });
});
