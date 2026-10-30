import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog Primitive Component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete Machine"
        message="Are you sure you want to delete this machine?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByTestId('modal-dialog')).toBeNull();
  });

  it('renders title, message, and action buttons when open', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Machine"
        message="Are you sure you want to delete this machine?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('modal-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Machine')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this machine?')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Keep');
  });

  it('invokes onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Approve Timesheet"
        message="Submit this timesheet?"
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when cancel button or close button is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Discard Changes"
        message="You have unsaved changes."
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(handleCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('modal-close-btn'));
    expect(handleCancel).toHaveBeenCalledTimes(2);
  });

  it('disables buttons when isLoading is true', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Processing"
        message="Please wait"
        isLoading={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Processing...');
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeDisabled();
  });
});
