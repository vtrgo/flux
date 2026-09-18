"use client";

import { useState, useEffect, useCallback } from 'react';
import { InAppAlert } from '../types';
import { useSSE, useSSEConnectionStatus } from '../components/SSEProvider';
import { toast } from 'sonner';

const STORAGE_KEY = 'vtrflux_in_app_alerts_v1';
const MAX_ALERTS = 40;

export function useInAppAlerts() {
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const isConnected = useSSEConnectionStatus();

  // Load persisted alerts on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setAlerts(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to read alerts from localStorage", e);
    }
  }, []);

  // Sync to localStorage
  const persistAlerts = useCallback((newAlerts: InAppAlert[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAlerts));
    } catch (e) {
      console.error("Failed to save alerts to localStorage", e);
    }
  }, []);

  const addAlert = useCallback((alertData: Omit<InAppAlert, 'read'>) => {
    setAlerts(prev => {
      // Check if already present
      if (prev.some(a => a.id === alertData.id)) {
        return prev;
      }
      const newAlert: InAppAlert = {
        ...alertData,
        read: false,
      };
      const updated = [newAlert, ...prev].slice(0, MAX_ALERTS);
      persistAlerts(updated);
      return updated;
    });

    // Fire ambient sonner toast
    const toastTitle = alertData.title || "Quality Alert";
    const toastDesc = alertData.description;
    if (alertData.severity === 'critical') {
      toast.error(toastTitle, { description: toastDesc });
    } else if (alertData.severity === 'moderate') {
      toast.warning(toastTitle, { description: toastDesc });
    } else {
      toast.info(toastTitle, { description: toastDesc });
    }
  }, [persistAlerts]);

  // Handle direct notification_alert SSE events
  useSSE('notification_alert', useCallback((data: any) => {
    if (!data || !data.id) return;
    addAlert({
      id: data.id,
      type: data.type || 'defect',
      title: data.title || `Issue Logged: ${data.machine_number || ''}`,
      description: data.description || '',
      severity: data.severity || 'moderate',
      department: data.department,
      machine_id: data.machine_id,
      machine_number: data.machine_number,
      recipient_email: data.recipient_email,
      opened_by: data.opened_by,
      created_at: data.created_at || new Date().toISOString(),
    });
  }, [addAlert]));

  // Handle defect_added events
  useSSE('defect_added', useCallback((data: any) => {
    if (!data || !data.id) return;
    addAlert({
      id: data.id,
      type: 'defect',
      title: `Issue Logged: ${data.order_number || data.source_department || 'General'}`,
      description: data.description || '',
      severity: data.severity || 'moderate',
      department: data.assigned_department,
      machine_id: data.machine_id,
      recipient_email: data.recipient_email,
      opened_by: data.created_by_user_name,
      created_at: data.created_at || new Date().toISOString(),
    });
  }, [addAlert]));

  const markAsRead = useCallback((id: string) => {
    setAlerts(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, read: true } : a);
      persistAlerts(updated);
      return updated;
    });
  }, [persistAlerts]);

  const markAllAsRead = useCallback(() => {
    setAlerts(prev => {
      const updated = prev.map(a => ({ ...a, read: true }));
      persistAlerts(updated);
      return updated;
    });
  }, [persistAlerts]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    persistAlerts([]);
  }, [persistAlerts]);

  const unreadCount = alerts.filter(a => !a.read).length;

  return {
    alerts,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAlerts,
    isConnected,
  };
}
