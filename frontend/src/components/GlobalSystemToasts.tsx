"use client";
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSSE } from './SSEProvider';

export function GlobalSystemToasts() {
  useSSE('server_log_entry', (data: any) => {
    // data might have .level, .msg, or .message depending on how it's marshalled
    const level = data.level?.toUpperCase();
    const message = data.message || data.msg;

    if (level === 'ERROR' && message) {
      toast.error(`System Error: ${message}`, {
        duration: 5000,
      });
    }
    // We can add logic for SYSTEM or WARNING levels here if desired
  });

  return null;
}
