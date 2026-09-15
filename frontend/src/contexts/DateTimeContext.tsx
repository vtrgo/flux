"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { TimezoneOption } from '../types';
import {
  DEFAULT_SITE_TIMEZONE,
  formatFatDate as utilsFormatFatDate,
  calculateDaysLate as utilsCalculateDaysLate,
  calculateProjectDaysLate as utilsCalculateProjectDaysLate,
  formatTimestamp as utilsFormatTimestamp,
  toCalendarDateInput as utilsToCalendarDateInput,
  calendarDateToUtcNoon as utilsCalendarDateToUtcNoon,
} from '../lib/dateUtils';

interface DateTimeContextType {
  timezone: string;
  setTimezone: (tz: string) => Promise<void>;
  availableTimezones: TimezoneOption[];
  loading: boolean;
  formatDate: (date?: string | Date | null, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date?: string | Date | null, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date?: string | Date | null, options?: Intl.DateTimeFormatOptions) => string;
  formatFatDate: (date?: string | null, fallback?: string) => string;
  calculateDaysLate: (fatDateStr?: string | null) => number;
  calculateProjectDaysLate: (machines?: { fat_date?: string | null }[]) => number;
  toCalendarDateInput: (dateStr?: string | null) => string;
  calendarDateToUtcNoon: (dateStr?: string | null) => string | undefined;
}

const DateTimeContext = createContext<DateTimeContextType>({
  timezone: DEFAULT_SITE_TIMEZONE,
  setTimezone: async () => {},
  availableTimezones: [],
  loading: true,
  formatDate: () => '',
  formatTime: () => '',
  formatDateTime: () => '',
  formatFatDate: () => 'None',
  calculateDaysLate: () => 0,
  calculateProjectDaysLate: () => 0,
  toCalendarDateInput: () => '',
  calendarDateToUtcNoon: () => undefined,
});

export const useDateTime = () => useContext(DateTimeContext);
// Alias for convenience
export const useTimezone = () => useContext(DateTimeContext);

export const DateTimeProvider = ({ children }: { children: ReactNode }) => {
  const [timezone, setTimezoneState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('vtr_site_timezone');
      if (cached) return cached;
    }
    return DEFAULT_SITE_TIMEZONE;
  });
  const [availableTimezones, setAvailableTimezones] = useState<TimezoneOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load site timezone and available options from backend
  const refreshTimezone = useCallback(async () => {
    try {
      const [tzRes, optionsRes] = await Promise.all([
        fetchApi<{ timezone: string }>('/system/timezone'),
        fetchApi<TimezoneOption[]>('/system/timezones'),
      ]);

      if (tzRes && tzRes.timezone) {
        setTimezoneState(tzRes.timezone);
        if (typeof window !== 'undefined') {
          localStorage.setItem('vtr_site_timezone', tzRes.timezone);
        }
      }

      if (optionsRes && Array.isArray(optionsRes)) {
        setAvailableTimezones(optionsRes);
      }
    } catch (err) {
      console.error('Failed to load system timezone settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTimezone();
  }, [refreshTimezone]);

  // Real-time SSE updates when an admin modifies the timezone
  useSSE('timezone_updated', (data: any) => {
    if (data && data.timezone) {
      setTimezoneState(data.timezone);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vtr_site_timezone', data.timezone);
      }
    }
  });

  const setTimezone = useCallback(async (newTz: string) => {
    const res = await fetchApi<{ timezone: string }>('/system/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone: newTz }),
    });
    if (res && res.timezone) {
      setTimezoneState(res.timezone);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vtr_site_timezone', res.timezone);
      }
    }
  }, []);

  const formatDate = useCallback((date?: string | Date | null, options?: Intl.DateTimeFormatOptions): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        ...options,
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  }, [timezone]);

  const formatTime = useCallback((date?: string | Date | null, options?: Intl.DateTimeFormatOptions): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        ...options,
      }).format(d);
    } catch {
      return d.toLocaleTimeString();
    }
  }, [timezone]);

  const formatDateTime = useCallback((date?: string | Date | null, options?: Intl.DateTimeFormatOptions): string => {
    if (!date) return '';
    const dateStr = typeof date === 'string' ? date : date.toISOString();
    return utilsFormatTimestamp(dateStr, timezone, options);
  }, [timezone]);

  const formatFatDateBound = useCallback((date?: string | null, fallback?: string): string => {
    return utilsFormatFatDate(date, fallback, timezone);
  }, [timezone]);

  const calculateDaysLateBound = useCallback((fatDateStr?: string | null): number => {
    return utilsCalculateDaysLate(fatDateStr, timezone);
  }, [timezone]);

  const calculateProjectDaysLateBound = useCallback((machines?: { fat_date?: string | null }[]): number => {
    return utilsCalculateProjectDaysLate(machines, timezone);
  }, [timezone]);

  const toCalendarDateInputBound = useCallback((dateStr?: string | null): string => {
    return utilsToCalendarDateInput(dateStr, timezone);
  }, [timezone]);

  const calendarDateToUtcNoonBound = useCallback((dateStr?: string | null): string | undefined => {
    return utilsCalendarDateToUtcNoon(dateStr);
  }, []);

  return (
    <DateTimeContext.Provider value={{
      timezone,
      setTimezone,
      availableTimezones,
      loading,
      formatDate,
      formatTime,
      formatDateTime,
      formatFatDate: formatFatDateBound,
      calculateDaysLate: calculateDaysLateBound,
      calculateProjectDaysLate: calculateProjectDaysLateBound,
      toCalendarDateInput: toCalendarDateInputBound,
      calendarDateToUtcNoon: calendarDateToUtcNoonBound,
    }}>
      {children}
    </DateTimeContext.Provider>
  );
};
