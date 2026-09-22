import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { NCRModal } from './NCRModal';
import { fetchApi } from '../lib/api';

vi.mock('../lib/api');
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
  }
}));

describe('NCRModal Component', () => {
  const mockMachines = [
    { id: 'm-1', order_number: 'VTR-1001', model_type: 'Centrifugal Feeder' },
    { id: 'm-2', order_number: 'VTR-1002', model_type: 'Linear Track' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchApi as any).mockImplementation((url: string) => {
      if (url === 'machines') {
        return Promise.resolve(mockMachines);
      }
      if (url === 'ncrs/next-number') {
        return Promise.resolve({ next_number: 'NCR-2026-042' });
      }
      if (url === 'ncrs') {
        return Promise.resolve({
          id: 'ncr-created-1',
          is_ncr: true,
          ncr_number: 'NCR-2026-042'
        });
      }
      return Promise.resolve(null);
    });
  });

  it('renders NCR form fields and pre-fills next NCR number', async () => {
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
    expect(screen.getByLabelText(/Team Lead Signature/i)).toBeDefined();

    const ncrInput = screen.getByLabelText(/NCR Identification #/i) as HTMLInputElement;
    expect(ncrInput.value).toBe('NCR-2026-042');
  });

  it('submits valid NCR data when submit button is pressed', async () => {
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

    fireEvent.change(assemblerInput, { target: { value: 'Alex Tech' } });
    fireEvent.change(locationInput, { target: { value: 'Station 2 - Track B' } });
    fireEvent.change(descInput, { target: { value: 'Bracket misalignment 1.5mm' } });

    const submitBtn = screen.getByRole('button', { name: /Create NCR/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('ncrs', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Alex Tech'),
    }));
    expect(handleSaved).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
