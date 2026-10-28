import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EditMachineModal } from './EditMachineModal';
import { Machine } from '../types';

describe('EditMachineModal Component', () => {
  const mockMachine: Machine = {
    id: 'm-1',
    sales_order_id: 'so-1',
    order_number: 'SN-1001',
    model_type: 'Conveyor Unit',
    status: 'in_progress',
    created_at: new Date().toISOString(),
  };

  it('retains focus when user modifies fields and does not steal focus to close button', () => {
    render(
      <EditMachineModal
        isOpen={true}
        onClose={vi.fn()}
        machine={mockMachine}
      />
    );

    const modelInput = screen.getByLabelText(/Part \/ Model Type/i);
    const closeBtn = screen.getByTestId('modal-close-btn');

    modelInput.focus();
    expect(document.activeElement).toBe(modelInput);

    fireEvent.change(modelInput, { target: { value: 'Conveyor Unit X' } });
    expect(document.activeElement).toBe(modelInput);
    expect(document.activeElement).not.toBe(closeBtn);
  });
});
