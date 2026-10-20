import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge Primitive Component', () => {
  it('renders status text correctly', () => {
    render(<StatusBadge status="open" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('open');
  });

  it('automatically resolves severity to appropriate variant', () => {
    render(<StatusBadge severity="critical" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('critical');
  });

  it('formats underscore statuses into clean display text', () => {
    render(<StatusBadge status="in_progress" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('in progress');
  });

  it('renders custom label and dot indicator when provided', () => {
    render(<StatusBadge variant="success" label="All Checks Passed" showDot />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('All Checks Passed');
  });
});
