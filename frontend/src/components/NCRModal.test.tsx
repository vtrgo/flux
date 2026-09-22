import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { NCRModal } from './NCRModal';
import { fetchApi } from '../lib/api';

import { useAuth } from '../contexts/AuthContext';

vi.mock('../lib/api');
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('./ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />
}));
vi.mock('./AttachmentViewer', () => ({
  AttachmentViewer: () => <div data-testid="attachment-viewer" />
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  }
}));
vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: () => true,
}));

describe('NCRModal Component', () => {
  const mockMachines = [
    { id: 'm-1', order_number: 'VTR-1001', model_type: 'Centrifugal Feeder' },
    { id: 'm-2', order_number: 'VTR-1002', model_type: 'Linear Track' }
  ];

  const mockManagers = [
    { id: 'usr-1', username: 'enda', first_name: 'Enda', last_name: 'McNamara', role: 'manager', department: 'assembly', email: 'enda@example.com' },
    { id: 'usr-2', username: 'lucas', first_name: 'Lucas', last_name: 'Sinclair', role: 'manager', department: 'quality', email: 'lucas@example.com' }
  ];

  const mockAttachments = [
    { id: 'att-1', issue_id: 'ncr-99', filename: 'weld_crack.jpg', file_path: '/uploads/weld_crack.jpg' },
    { id: 'att-2', issue_id: 'ncr-99', filename: 'alignment_gauge.png', file_path: '/uploads/alignment_gauge.png' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: 'usr-1', username: 'admin_user', role: 'manager' },
      hasRole: (roles: string | string[]) => {
        const r = Array.isArray(roles) ? roles : [roles];
        return r.includes('manager') || r.includes('admin');
      },
      hasDepartment: () => true,
      isAdmin: false,
      loading: false,
    });
    (fetchApi as any).mockImplementation((url: string) => {
      if (url === 'machines') {
        return Promise.resolve(mockMachines);
      }
      if (url === 'ncrs/next-number') {
        return Promise.resolve({ next_number: 'NCR-2026-042' });
      }
      if (url === 'users?role=manager') {
        return Promise.resolve(mockManagers);
      }
      if (url === 'issues/ncr-99/attachments') {
        return Promise.resolve(mockAttachments);
      }
      if (url === 'ncrs') {
        return Promise.resolve({
          id: 'ncr-created-1',
          is_ncr: true,
          ncr_number: 'NCR-2026-042'
        });
      }
      if (url.startsWith('ncrs/')) {
        return Promise.resolve({
          id: 'ncr-99',
          is_ncr: true,
        });
      }
      return Promise.resolve(null);
    });
  });

  it('renders NCR form fields without severity and routing department', async () => {
    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
        />
      );
    });

    expect(screen.getByText(/Fabricated Components/i)).toBeDefined();
    expect(screen.getByText(/Non-Conformance Report/i)).toBeDefined();
    expect(screen.getByLabelText(/NCR Identification #/i)).toBeDefined();
    expect(screen.getByLabelText(/Location of NC/i)).toBeDefined();
    expect(screen.getByLabelText(/Assembler/i)).toBeDefined();
    expect(screen.getByLabelText(/Root Cause of NCR/i)).toBeDefined();
    expect(screen.getByLabelText(/Correction Taken \/ Action Items/i)).toBeDefined();
    expect(screen.getByLabelText(/Assigned Responsible Person/i)).toBeDefined();

    // Verify Severity, Routing Department, and Lifecycle Status selector are completely removed from the form
    expect(screen.queryByLabelText(/^Severity$/i)).toBeNull();
    expect(screen.queryByLabelText(/Routing Department/i)).toBeNull();
    expect(screen.queryByLabelText(/NCR Lifecycle Status/i)).toBeNull();

    const ncrInput = screen.getByLabelText(/NCR Identification #/i) as HTMLInputElement;
    expect(ncrInput.value).toBe('NCR-2026-042');
  });

  it('loads managers from database into Assigned Responsible Person dropdown', async () => {
    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
        />
      );
    });

    expect(fetchApi).toHaveBeenCalledWith('users?role=manager');
    const signatureSelect = screen.getByLabelText(/Assigned Responsible Person/i) as HTMLSelectElement;
    expect(signatureSelect).toBeDefined();

    // Check placeholder option
    expect(screen.getByRole('option', { name: /-- Select Assigned Responsible Person --/i })).toBeDefined();

    // Check that manager options are rendered
    expect(screen.getByRole('option', { name: /Enda McNamara \(Assembly\)/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /Lucas Sinclair \(Quality/i })).toBeDefined();

    // Select a manager
    fireEvent.change(signatureSelect, { target: { value: 'Enda McNamara' } });
    expect(signatureSelect.value).toBe('Enda McNamara');
  });

  it('submits valid NCR data with default severity and routing department', async () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      );
    });

    const assemblerInput = screen.getByLabelText(/Assembler/i);
    const locationInput = screen.getByLabelText(/Location of NC/i);
    const descInput = screen.getByPlaceholderText(/Provide a detailed description of the non-conformance/i);
    const signatureSelect = screen.getByLabelText(/Assigned Responsible Person/i);

    fireEvent.change(assemblerInput, { target: { value: 'Alex Tech' } });
    fireEvent.change(locationInput, { target: { value: 'Station 2 - Track B' } });
    fireEvent.change(descInput, { target: { value: 'Bracket misalignment 1.5mm' } });
    fireEvent.change(signatureSelect, { target: { value: 'Lucas Sinclair' } });

    const submitBtn = screen.getByRole('button', { name: /Create NCR/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('ncrs', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"severity":"moderate"'),
    }));
    expect(fetchApi).toHaveBeenCalledWith('ncrs', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"assigned_department":"assembly"'),
    }));
    expect(fetchApi).toHaveBeenCalledWith('ncrs', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"team_lead_signature":"Lucas Sinclair"'),
    }));
    expect(handleSaved).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it('allows lifecycle status changes and quick closing/verification actions', async () => {
    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'moderate',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            root_cause: 'Misaligned jig',
            corrective_action: 'Re-calibrated jig',
            team_lead_signature: 'Enda McNamara',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    // Quick action: Mark Fixed / Closed
    const markClosedBtn = screen.getByRole('button', { name: /Mark Fixed \/ Closed/i });
    expect(markClosedBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(markClosedBtn);
    });

    // Quick action: Verify & Sign Off
    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign Off/i });
    expect(verifyBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    // Quick action: Re-Open
    const reopenBtn = screen.getByRole('button', { name: /Re-Open NCR/i });
    expect(reopenBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(reopenBtn);
    });

    // Save changes
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('ncrs/ncr-99', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"status":"open"'),
    }));
  });

  it('renders attached images in printable gallery', async () => {
    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'moderate',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    // Verify attachments fetched
    expect(fetchApi).toHaveBeenCalledWith('issues/ncr-99/attachments');

    // Printable section for images
    expect(screen.getByText(/Attached Photos & Documentation/i)).toBeDefined();
    expect(screen.getByText('weld_crack.jpg')).toBeDefined();
    expect(screen.getByText('alignment_gauge.png')).toBeDefined();
  });

  it('renders notification routing checkbox and includes send_notification in payload', async () => {
    const handleSaved = vi.fn();

    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          onSaved={handleSaved}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'moderate',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            team_lead_signature: 'Enda McNamara',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    // Check notification routing checkbox
    const notifyCheckbox = screen.getByRole('checkbox', { name: /ROUTE TO NOTIFICATIONS/i });
    expect(notifyCheckbox).toBeDefined();

    // Toggle notification
    fireEvent.click(notifyCheckbox);

    // Save changes
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('ncrs/ncr-99', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"send_notification":true'),
    }));
  });

  it('renders clean printable report elements and signature line', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          autoPrint={true}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'critical',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            root_cause: 'Misaligned jig',
            corrective_action: 'Re-calibrated jig',
            team_lead_signature: 'Lead Tech Jane',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    // Check printable container
    const printableReport = document.getElementById('ncr-printable-report');
    expect(printableReport).toBeDefined();

    // Check title and logo
    expect(screen.getByText(/Fabricated Components/i)).toBeDefined();
    expect(screen.getByText(/Non-Conformance Report/i)).toBeDefined();

    // Check digital signature representation
    expect(screen.getByText('Lead Tech Jane')).toBeDefined();

    // Verify print button exists
    const printBtn = screen.getByRole('button', { name: /Print \/ Save to PDF/i });
    expect(printBtn).toBeDefined();

    printSpy.mockRestore();
  });

  it('clears Route to notifications checkbox when reviewing or editing an existing NCR', async () => {
    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'moderate',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            team_lead_signature: 'Enda McNamara',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    const notifyCheckbox = screen.getByRole('checkbox', { name: /ROUTE TO NOTIFICATIONS/i }) as HTMLInputElement;
    expect(notifyCheckbox.checked).toBe(false);
  });

  it('hides Mark Fixed / Closed and Verify & Sign Off buttons if user is not manager or above', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'usr-operator', username: 'op_user', role: 'operator' },
      hasRole: (roles: string | string[]) => {
        const r = Array.isArray(roles) ? roles : [roles];
        return r.includes('operator');
      },
      hasDepartment: () => true,
      isAdmin: false,
      loading: false,
    });

    await act(async () => {
      render(
        <NCRModal
          isOpen={true}
          onClose={() => {}}
          editingNCR={{
            id: 'ncr-99',
            machine_id: 'm-1',
            order_number: 'VTR-1001',
            is_ncr: true,
            ncr_number: 'NCR-2026-099',
            assembler: 'Sam Tech',
            location: 'Station 1 Rail',
            description: 'Rail defect 1.2mm',
            severity: 'moderate',
            status: 'open',
            source_department: 'quality',
            assigned_department: 'assembly',
            team_lead_signature: 'Enda McNamara',
            created_at: '2026-09-22T10:00:00Z',
          }}
        />
      );
    });

    expect(screen.queryByRole('button', { name: /Mark Fixed \/ Closed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Verify & Sign Off/i })).toBeNull();
    // Non-managers can still see standard cancel / save buttons
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDefined();
  });
});

