import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Modal } from './Modal';

describe('Modal Primitive Component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test Dialog">
        Modal Content
      </Modal>
    );
    expect(screen.queryByTestId('modal-dialog')).toBeNull();
  });

  it('renders title, content, and footer when isOpen is true', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Machine Details"
        subtitle="M-5000 Rotary Dial"
        footer={<button>Confirm</button>}
      >
        <p>Active issues content</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-dialog')).toBeInTheDocument();
    expect(screen.getByText('Machine Details')).toBeInTheDocument();
    expect(screen.getByText('M-5000 Rotary Dial')).toBeInTheDocument();
    expect(screen.getByText('Active issues content')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        Content
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close-btn'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        Content
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the backdrop', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        Content
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
