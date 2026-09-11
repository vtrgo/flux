import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import AdminReleasesPage from './page';
import { fetchApi } from '../../../../lib/api';

vi.mock('../../../../lib/api', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminReleasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    (fetchApi as any).mockImplementation(() => new Promise(() => {}));

    render(<AdminReleasesPage />);

    expect(screen.getByText(/Loading release & environment telemetry/i)).toBeDefined();
  });

  it('renders version info, environment, and release tags on successful fetch', async () => {
    const mockData = {
      version: 'v0.9.4-test',
      commit: 'abc1234567890',
      build_date: '2026-09-11T15:00:00Z',
      environment: 'development',
      database_online: true,
      git_branch: 'feature/admin-releases-portal',
      recent_releases: [
        {
          tag: 'v0.9.3',
          date: '2026-09-10',
          subject: 'Release 0.9.3 with multi-tenant fixes',
        },
        {
          tag: 'v0.9.2',
          date: '2026-09-08',
          subject: 'Release 0.9.2 security patch',
        },
      ],
      deploy_script_path: 'scripts/deploy_production.sh',
    };

    (fetchApi as any).mockResolvedValue(mockData);

    await act(async () => {
      render(<AdminReleasesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('v0.9.4-test')).toBeDefined();
    });

    expect(screen.getByText('abc1234567890')).toBeDefined();
    expect(screen.getByText('feature/admin-releases-portal')).toBeDefined();
    expect(screen.getByText('development')).toBeDefined();
    expect(screen.getByText('ONLINE')).toBeDefined();
    expect(screen.getByText('v0.9.3')).toBeDefined();
    expect(screen.getByText('Release 0.9.3 with multi-tenant fixes')).toBeDefined();
    expect(screen.getByText('v0.9.2')).toBeDefined();
  });

  it('renders error state when fetchApi fails', async () => {
    (fetchApi as any).mockRejectedValue(new Error('Network error loading version'));

    await act(async () => {
      render(<AdminReleasesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Network error loading version')).toBeDefined();
    });
  });
});
