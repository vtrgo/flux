import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { TimezoneSelector } from './TimezoneSelector';
import { useDateTime } from '../contexts/DateTimeContext';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/DateTimeContext');
vi.mock('../contexts/AuthContext');

describe('TimezoneSelector Component', () => {
  const mockSetTimezone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useDateTime as any).mockReturnValue({
      timezone: 'America/Toronto',
      setTimezone: mockSetTimezone,
      availableTimezones: [
        { id: 'America/Toronto', name: 'Eastern Time (Toronto)', region: 'North America', offset: 'UTC-04:00' },
        { id: 'America/Chicago', name: 'Central Time (Chicago)', region: 'North America', offset: 'UTC-05:00' },
        { id: 'UTC', name: 'UTC', region: 'Universal', offset: 'UTC+00:00' },
      ],
      loading: false,
    });
    (useAuth as any).mockReturnValue({
      isAdmin: true,
    });
  });

  it('renders timezone select with options', () => {
    render(<TimezoneSelector />);

    expect(screen.getByLabelText('Site Timezone:')).toBeDefined();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('America/Toronto');
    expect(screen.getByText(/Current Time in/)).toBeDefined();
  });

  it('allows admin to change selection and shows Apply button', async () => {
    render(<TimezoneSelector />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'America/Chicago' } });
    });

    expect(select.value).toBe('America/Chicago');
    const applyBtn = screen.getByRole('button', { name: 'Apply Timezone' });
    expect(applyBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(applyBtn);
    });
    expect(mockSetTimezone).toHaveBeenCalledWith('America/Chicago');
  });

  it('disables select and shows notice for non-admin users', () => {
    (useAuth as any).mockReturnValue({
      isAdmin: false,
    });

    render(<TimezoneSelector />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText(/\* Administrator privileges are required/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Apply Timezone' })).toBeNull();
  });
});
