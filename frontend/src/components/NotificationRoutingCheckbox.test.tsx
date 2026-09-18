import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NotificationRoutingCheckbox } from './NotificationRoutingCheckbox';
import { User } from '../types';

describe('NotificationRoutingCheckbox', () => {
  const mockUserWithEmail: User = {
    id: 'u-1',
    username: 'lucas',
    first_name: 'Lucas',
    last_name: 'Rettore',
    email: 'lucas@vtrfeedersolutions.com',
  };

  const mockUserWithoutEmail: User = {
    id: 'u-2',
    username: 'tyler',
    first_name: 'Tyler',
    last_name: 'Durden',
  };

  it('renders unchecked checkbox by default without recipient preview', () => {
    render(
      <NotificationRoutingCheckbox
        checked={false}
        onChange={() => {}}
      />
    );

    const checkbox = screen.getByLabelText(/ROUTE TO NOTIFICATIONS/i) as HTMLInputElement;
    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByText(/Target Recipient/i)).toBeNull();
  });

  it('calls onChange callback when clicked', () => {
    const handleChange = vi.fn();
    render(
      <NotificationRoutingCheckbox
        checked={false}
        onChange={handleChange}
      />
    );

    const checkbox = screen.getByLabelText(/ROUTE TO NOTIFICATIONS/i);
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('displays user full name and email when assignee is assigned with email', () => {
    render(
      <NotificationRoutingCheckbox
        checked={true}
        onChange={() => {}}
        assignedUser={mockUserWithEmail}
      />
    );

    expect(screen.getByText(/Target Recipient:/i)).toBeDefined();
    expect(screen.getByText(/Lucas Rettore \(lucas@vtrfeedersolutions.com\)/i)).toBeDefined();
  });

  it('displays warning and fallback when assignee has no email configured', () => {
    render(
      <NotificationRoutingCheckbox
        checked={true}
        onChange={() => {}}
        assignedUser={mockUserWithoutEmail}
      />
    );

    expect(screen.getByText(/tyler has no email configured/i)).toBeDefined();
    expect(screen.getByText(/falls back to default: justin@vtrfeedersolutions.com/i)).toBeDefined();
  });

  it('displays unassigned fallback when no assignee is selected', () => {
    render(
      <NotificationRoutingCheckbox
        checked={true}
        onChange={() => {}}
      />
    );

    expect(screen.getByText(/No assignee selected/i)).toBeDefined();
    expect(screen.getByText(/falls back to default: justin@vtrfeedersolutions.com/i)).toBeDefined();
  });

  it('allows custom fallback recipient email', () => {
    render(
      <NotificationRoutingCheckbox
        checked={true}
        onChange={() => {}}
        defaultRecipientEmail="custom@vtrfeedersolutions.com"
      />
    );

    expect(screen.getByText(/falls back to default: custom@vtrfeedersolutions.com/i)).toBeDefined();
  });

  it('disables checkbox when disabled prop is true', () => {
    render(
      <NotificationRoutingCheckbox
        checked={false}
        onChange={() => {}}
        disabled={true}
      />
    );

    const checkbox = screen.getByLabelText(/ROUTE TO NOTIFICATIONS/i) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
