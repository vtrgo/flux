import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AuthGuard } from './AuthGuard';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

vi.mock('../contexts/AuthContext');
vi.mock('next/navigation');

describe('AuthGuard Component', () => {
  const replaceMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ replace: replaceMock });
    (usePathname as any).mockReturnValue('/quality');
  });

  it('renders loading state when auth state is resolving', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: true,
    });

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByText(/Verifying MES Access Credentials/i)).toBeDefined();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('redirects unauthenticated user to /login with target from parameter', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: false,
    });

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(replaceMock).toHaveBeenCalledWith('/login?from=%2Fquality');
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('renders protected content when user is authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u1', username: 'jdoe', role: 'technician' },
      loading: false,
    });

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByText('Protected Content')).toBeDefined();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
