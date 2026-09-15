"use client";

import { useState, useEffect } from 'react';
import { useDateTime } from '../contexts/DateTimeContext';

export function DigitalClock() {
  const { timezone } = useDateTime();
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      try {
        setTime(now.toLocaleTimeString('en-US', { 
          timeZone: timezone, 
          hour12: true, 
          hour: 'numeric', 
          minute: '2-digit', 
          second: '2-digit' 
        }));
      } catch {
        setTime(now.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }));
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  return (
    <div style={{
      fontFamily: 'var(--font-digital), monospace',
      fontSize: '4rem',
      fontWeight: 'normal',
      color: 'var(--vtr-theme-primary)',
      letterSpacing: '0.05em',
      textShadow: '0 0 10px rgba(var(--vtr-theme-primary-rgb), 0.5)',
      fontVariantNumeric: 'tabular-nums'
    }}>
      {time || '88:88:88 AM'}
    </div>
  );
}
