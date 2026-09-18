import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NotificationBell } from './NotificationBell';
import { useInAppAlerts } from '../hooks/useInAppAlerts';
import { useRouter } from 'next/navigation';

vi.mock('../hooks/useInAppAlerts');
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

describe('NotificationBell', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders bell icon with 0 unread alerts and no badge', () => {
    (useInAppAlerts as any).mockReturnValue({
      alerts: [],
      unreadCount: 0,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      clearAlerts: vi.fn(),
      isConnected: true,
    });

    render(<NotificationBell />);

    const bellBtn = screen.getByLabelText(/Notifications \(0 unread\)/i);
    expect(bellBtn).toBeDefined();
    expect(screen.queryByText('ALERT HISTORY')).toBeNull();
  });

  it('renders badge with unread count when unread alerts are present', () => {
    (useInAppAlerts as any).mockReturnValue({
      alerts: [
        {
          id: 'alt-1',
          type: 'defect',
          title: 'Issue Logged: 25-115G',
          description: 'Track clearance loose',
          severity: 'critical',
          department: 'assembly',
          created_at: new Date().toISOString(),
          read: false,
        },
      ],
      unreadCount: 1,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      clearAlerts: vi.fn(),
      isConnected: true,
    });

    render(<NotificationBell />);

    expect(screen.getByText('1')).toBeDefined();
  });

  it('toggles dropdown on click and displays alert history', () => {
    const markAllAsRead = vi.fn();
    const clearAlerts = vi.fn();

    (useInAppAlerts as any).mockReturnValue({
      alerts: [
        {
          id: 'alt-1',
          type: 'defect',
          title: 'Issue Logged: 25-115G',
          description: 'Track clearance loose',
          severity: 'critical',
          department: 'assembly',
          created_at: new Date().toISOString(),
          read: false,
        },
      ],
      unreadCount: 1,
      markAsRead: vi.fn(),
      markAllAsRead,
      clearAlerts,
      isConnected: true,
    });

    render(<NotificationBell />);

    const bellBtn = screen.getByLabelText(/Notifications/i);
    fireEvent.click(bellBtn);

    expect(screen.getByText('ALERT HISTORY')).toBeDefined();
    expect(screen.getByText('LIVE')).toBeDefined();
    expect(screen.getByText('Issue Logged: 25-115G')).toBeDefined();
    expect(screen.getByText('Track clearance loose')).toBeDefined();
    expect(screen.getByText('CRITICAL')).toBeDefined();

    // Click "Mark all read"
    const markBtn = screen.getByText('Mark all read');
    fireEvent.click(markBtn);
    expect(markAllAsRead).toHaveBeenCalled();

    // Click "Clear"
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);
    expect(clearAlerts).toHaveBeenCalled();
  });

  it('navigates to machine view and marks read when an alert is clicked', () => {
    const markAsRead = vi.fn();

    (useInAppAlerts as any).mockReturnValue({
      alerts: [
        {
          id: 'alt-1',
          type: 'defect',
          machine_id: 'mach-99',
          title: 'Issue Logged: 25-115G',
          description: 'Track clearance loose',
          severity: 'critical',
          department: 'assembly',
          created_at: new Date().toISOString(),
          read: false,
        },
      ],
      unreadCount: 1,
      markAsRead,
      markAllAsRead: vi.fn(),
      clearAlerts: vi.fn(),
      isConnected: true,
    });

    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText(/Notifications/i));
    const alertItem = screen.getByText('Issue Logged: 25-115G');
    fireEvent.click(alertItem);

    expect(markAsRead).toHaveBeenCalledWith('alt-1');
    expect(mockPush).toHaveBeenCalledWith('/machine?id=mach-99');
    expect(screen.queryByText('ALERT HISTORY')).toBeNull(); // Closes dropdown
  });

  it('closes dropdown when Escape key is pressed', () => {
    (useInAppAlerts as any).mockReturnValue({
      alerts: [],
      unreadCount: 0,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      clearAlerts: vi.fn(),
      isConnected: true,
    });

    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText(/Notifications/i));
    expect(screen.getByText('ALERT HISTORY')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('ALERT HISTORY')).toBeNull();
  });
});
