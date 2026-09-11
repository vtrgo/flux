import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import ProfilePage from './page';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchApi } from '../../../lib/api';

vi.mock('../../../contexts/AuthContext');
vi.mock('../../../lib/api');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('ProfilePage Password Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user details and password change form for local accounts', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u1',
        username: 'jdoe',
        first_name: 'John',
        last_name: 'Doe',
        department: 'assembly',
        role: 'technician',
        auth_provider: 'local',
      }
    });

    render(<ProfilePage />);

    expect(screen.getByText('jdoe')).toBeDefined();
    expect(screen.getByText('John Doe')).toBeDefined();
    expect(screen.getByText('assembly')).toBeDefined();
    expect(screen.getByLabelText(/Current Password/i)).toBeDefined();
    expect(screen.getByLabelText(/^New Password/i)).toBeDefined();
    expect(screen.getByLabelText(/Confirm New Password/i)).toBeDefined();
  });

  it('displays mismatch error if new password and confirm password do not match', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u1',
        username: 'jdoe',
        auth_provider: 'local',
      }
    });

    render(<ProfilePage />);

    const currentInput = screen.getByLabelText(/Current Password/i);
    const newInput = screen.getByLabelText(/^New Password/i);
    const confirmInput = screen.getByLabelText(/Confirm New Password/i);
    const submitBtn = screen.getByRole('button', { name: /Save New Password/i });

    await act(async () => {
      fireEvent.change(currentInput, { target: { value: 'oldpass123' } });
      fireEvent.change(newInput, { target: { value: 'newpass123' } });
      fireEvent.change(confirmInput, { target: { value: 'mismatch' } });
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText(/New password and confirmation do not match/i)).toBeDefined();
    expect(fetchApi).not.toHaveBeenCalled();
  });

  it('submits password change request when fields are valid', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u1',
        username: 'jdoe',
        auth_provider: 'local',
      }
    });

    (fetchApi as any).mockResolvedValue({ message: 'Password updated successfully' });

    render(<ProfilePage />);

    const currentInput = screen.getByLabelText(/Current Password/i);
    const newInput = screen.getByLabelText(/^New Password/i);
    const confirmInput = screen.getByLabelText(/Confirm New Password/i);
    const submitBtn = screen.getByRole('button', { name: /Save New Password/i });

    await act(async () => {
      fireEvent.change(currentInput, { target: { value: 'oldpass123' } });
      fireEvent.change(newInput, { target: { value: 'newsecurepass' } });
      fireEvent.change(confirmInput, { target: { value: 'newsecurepass' } });
      fireEvent.click(submitBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith('auth/change_password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: 'oldpass123',
        new_password: 'newsecurepass',
      })
    });
  });

  it('displays notice for external corporate accounts', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u2',
        username: 'aduser',
        auth_provider: 'activedirectory',
      }
    });

    render(<ProfilePage />);

    expect(screen.getByText(/managed via corporate Active Directory/i)).toBeDefined();
    expect(screen.queryByLabelText(/Current Password/i)).toBeNull();
  });
});
