import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Authorize } from './Authorize';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext');

describe('Authorize Component', () => {
  it('renders fallback when unauthenticated', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      hasRole: vi.fn().mockReturnValue(false),
      hasDepartment: vi.fn().mockReturnValue(false),
    });

    render(
      <Authorize fallback={<div>Access Denied</div>}>
        <div>Sensitive Button</div>
      </Authorize>
    );

    expect(screen.getByText('Access Denied')).toBeDefined();
    expect(screen.queryByText('Sensitive Button')).toBeNull();
  });

  it('renders children when user role matches', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      hasRole: vi.fn().mockImplementation((r) => r.includes('admin')),
      hasDepartment: vi.fn().mockReturnValue(false),
    });

    render(
      <Authorize roles={['admin', 'supervisor']}>
        <div>Privileged Action</div>
      </Authorize>
    );

    expect(screen.getByText('Privileged Action')).toBeDefined();
  });

  it('hides children when role does not match', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u2', username: 'tech', role: 'technician' },
      hasRole: vi.fn().mockReturnValue(false),
      hasDepartment: vi.fn().mockReturnValue(false),
    });

    render(
      <Authorize roles={['admin']}>
        <div>Admin Only Action</div>
      </Authorize>
    );

    expect(screen.queryByText('Admin Only Action')).toBeNull();
  });
});
