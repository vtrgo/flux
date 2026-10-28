import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SpawnMachineModal } from './SpawnMachineModal';

describe('SpawnMachineModal Component', () => {
  it('retains focus in input fields while typing and does not steal focus to close button', () => {
    render(
      <SpawnMachineModal
        isOpen={true}
        onClose={vi.fn()}
        orderId="order-123"
        orderName="Project Apollo"
      />
    );

    const modelInput = screen.getByLabelText(/Part \/ Model Type/i);
    const snInput = screen.getByLabelText(/S\/N or Tracking Number/i);
    const closeBtn = screen.getByTestId('modal-close-btn');

    modelInput.focus();
    expect(document.activeElement).toBe(modelInput);

    // Simulate typing multiple characters into Model Type
    fireEvent.change(modelInput, { target: { value: 'H' } });
    expect(document.activeElement).toBe(modelInput);
    expect(document.activeElement).not.toBe(closeBtn);

    fireEvent.change(modelInput, { target: { value: 'Ho' } });
    expect(document.activeElement).toBe(modelInput);
    expect(document.activeElement).not.toBe(closeBtn);

    fireEvent.change(modelInput, { target: { value: 'Housing Base' } });
    expect(document.activeElement).toBe(modelInput);
    expect(document.activeElement).not.toBe(closeBtn);

    // Switch focus to S/N input and simulate typing
    snInput.focus();
    expect(document.activeElement).toBe(snInput);

    fireEvent.change(snInput, { target: { value: 'SN-001' } });
    expect(document.activeElement).toBe(snInput);
    expect(document.activeElement).not.toBe(closeBtn);
  });
});
