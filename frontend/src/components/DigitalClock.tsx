"use client";

import { useState, useEffect } from 'react';

export function DigitalClock() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
