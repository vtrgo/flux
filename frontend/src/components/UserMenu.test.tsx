import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { UserMenu } from './UserMenu';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('UserMenu Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders first name with email in brackets when both are present', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u1',
        username: 'jdoe',
        email: 'justin@vtrfeedersolutions.com',
        first_name: 'Justin',
        last_name: 'Smith',
        role: 'admin',
        department: 'quality',
      },
      loading: false,
      logout: vi.fn(),
    });

    render(<UserMenu />);

    expect(screen.getByText(/Justin \(justin@vtrfeedersolutions\.com\)/)).toBeDefined();
    expect(screen.getByText('ADMIN')).toBeDefined();
    expect(screen.getByText('QUALITY')).toBeDefined();
  });

  it('falls back to first name and username if email is missing', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u2',
        username: 'jsmith',
        first_name: 'Justin',
        role: 'operator',
      },
      loading: false,
      logout: vi.fn(),
    });

    render(<UserMenu />);

    expect(screen.getByText(/Justin \(jsmith\)/)).toBeDefined();
  });

  it('renders username if first name is missing', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u3',
        username: 'tech_ops',
        role: 'operator',
      },
      loading: false,
      logout: vi.fn(),
    });

    render(<UserMenu />);

    expect(screen.getByText(/tech_ops/)).toBeDefined();
  });
});
