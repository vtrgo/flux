'use client';

import React from 'react';
import { Modal } from './Modal';
import styles from './Button.module.css';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}) {
  if (!isOpen) return null;

  const getConfirmStyle = () => {
    switch (variant) {
      case 'danger':
        return {
          backgroundColor: 'var(--color-danger, #ff5252)',
          borderColor: 'var(--color-danger, #ff5252)',
          color: '#fff',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--color-warning, #f59e0b)',
          borderColor: 'var(--color-warning, #f59e0b)',
          color: '#121212',
        };
      case 'primary':
      default:
        return {
          backgroundColor: 'var(--vtr-theme-primary, #3b82f6)',
          borderColor: 'var(--vtr-theme-primary, #3b82f6)',
          color: '#fff',
        };
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <button
            type="button"
            className="vtr-btn vtr-btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="vtr-btn"
            style={getConfirmStyle()}
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="confirm-dialog-confirm"
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      }
    >
      <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary, #cccccc)', fontSize: '0.95rem', lineHeight: '1.5' }}>
        {message}
      </div>
    </Modal>
  );
};
