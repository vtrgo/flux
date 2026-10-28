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

  it('traps focus within the modal on Tab key navigation', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Focus Trap Dialog"
        footer={<button data-testid="footer-btn">Submit</button>}
      >
        <input data-testid="input-field" placeholder="Type here" />
      </Modal>
    );

    const closeBtn = screen.getByTestId('modal-close-btn');
    const inputField = screen.getByTestId('input-field');
    const footerBtn = screen.getByTestId('footer-btn');

    // Focus last element (footer button) and press Tab -> should wrap to closeBtn
    footerBtn.focus();
    expect(document.activeElement).toBe(footerBtn);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Focus first element (close button) and press Shift+Tab -> should wrap to footerBtn
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(footerBtn);
  });

  it('restores focus to previous active element when modal unmounts', () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Open Modal';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Focus Restore Dialog">
        Modal Content
      </Modal>
    );

    unmount();
    expect(document.activeElement).toBe(triggerBtn);
    document.body.removeChild(triggerBtn);
  });

  it('focuses input in modal body rather than close button upon opening', async () => {
    vi.useFakeTimers();
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Focus Dialog">
        <input data-testid="target-input" placeholder="Enter text" />
      </Modal>
    );

    vi.runAllTimers();

    const targetInput = screen.getByTestId('target-input');
    const closeBtn = screen.getByTestId('modal-close-btn');

    expect(document.activeElement).toBe(targetInput);
    expect(document.activeElement).not.toBe(closeBtn);
    vi.useRealTimers();
  });

  it('does not hijack focus to close button when re-rendered with new onClose reference', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} title="Re-render Dialog">
        <input data-testid="typing-input" placeholder="Typing here" />
      </Modal>
    );

    vi.runAllTimers();
    const typingInput = screen.getByTestId('typing-input');
    const closeBtn = screen.getByTestId('modal-close-btn');

    typingInput.focus();
    expect(document.activeElement).toBe(typingInput);

    // Simulate parent re-render passing a new onClose function (e.g. on every keystroke)
    rerender(
      <Modal isOpen={true} onClose={() => {}} title="Re-render Dialog">
        <input data-testid="typing-input" placeholder="Typing here" />
      </Modal>
    );

    vi.runAllTimers();

    expect(document.activeElement).toBe(typingInput);
    expect(document.activeElement).not.toBe(closeBtn);
    vi.useRealTimers();
  });
});
