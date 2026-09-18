import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInAppAlerts } from './useInAppAlerts';
import { useSSE, useSSEConnectionStatus } from '../components/SSEProvider';
import { toast } from 'sonner';

vi.mock('../components/SSEProvider');
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useInAppAlerts', () => {
  let sseCallbacks: Record<string, (data: any) => void> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sseCallbacks = {};

    (useSSEConnectionStatus as any).mockReturnValue(true);
    (useSSE as any).mockImplementation((event: string, cb: any) => {
      sseCallbacks[event] = cb;
    });
  });

  it('initializes with empty alerts and 0 unreadCount', () => {
    const { result } = renderHook(() => useInAppAlerts());

    expect(result.current.alerts).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.isConnected).toBe(true);
  });

  it('loads saved alerts from localStorage', () => {
    const saved = [
      {
        id: 'saved-1',
        type: 'defect',
        title: 'Saved Alert',
        description: 'Saved description',
        severity: 'minor',
        created_at: new Date().toISOString(),
        read: false,
      },
    ];
    localStorage.setItem('vtrflux_in_app_alerts_v1', JSON.stringify(saved));

    const { result } = renderHook(() => useInAppAlerts());

    expect(result.current.alerts.length).toBe(1);
    expect(result.current.alerts[0].title).toBe('Saved Alert');
    expect(result.current.unreadCount).toBe(1);
  });

  it('adds an alert and triggers toast on notification_alert SSE event', () => {
    const { result } = renderHook(() => useInAppAlerts());

    act(() => {
      sseCallbacks['notification_alert']({
        id: 'alert-101',
        machine_number: '25-115G',
        title: 'Issue Logged: 25-115G',
        description: 'Gate alignment issue',
        severity: 'critical',
        department: 'controls',
        created_at: new Date().toISOString(),
      });
    });

    expect(result.current.alerts.length).toBe(1);
    expect(result.current.alerts[0].id).toBe('alert-101');
    expect(result.current.alerts[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);

    expect(toast.error).toHaveBeenCalledWith(
      'Issue Logged: 25-115G',
      expect.objectContaining({ description: 'Gate alignment issue' })
    );
  });

  it('marks specific alert as read', () => {
    const { result } = renderHook(() => useInAppAlerts());

    act(() => {
      sseCallbacks['notification_alert']({
        id: 'alert-1',
        title: 'Alert 1',
        description: 'Desc 1',
        severity: 'minor',
      });
      sseCallbacks['notification_alert']({
        id: 'alert-2',
        title: 'Alert 2',
        description: 'Desc 2',
        severity: 'minor',
      });
    });

    expect(result.current.unreadCount).toBe(2);

    act(() => {
      result.current.markAsRead('alert-1');
    });

    expect(result.current.unreadCount).toBe(1);
    expect(result.current.alerts.find(a => a.id === 'alert-1')?.read).toBe(true);
    expect(result.current.alerts.find(a => a.id === 'alert-2')?.read).toBe(false);
  });

  it('marks all alerts as read and clears alerts', () => {
    const { result } = renderHook(() => useInAppAlerts());

    act(() => {
      sseCallbacks['notification_alert']({
        id: 'alert-1',
        title: 'Alert 1',
        description: 'Desc 1',
        severity: 'moderate',
      });
    });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);

    act(() => {
      result.current.clearAlerts();
    });

    expect(result.current.alerts).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });
});
