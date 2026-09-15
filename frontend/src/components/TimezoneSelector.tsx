'use client';

import React, { useState, useEffect } from 'react';
import { useDateTime } from '../contexts/DateTimeContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export const TimezoneSelector = () => {
  const { timezone, setTimezone, availableTimezones, loading } = useDateTime();
  const { isAdmin } = useAuth();
  const [selectedTz, setSelectedTz] = useState<string>(timezone);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentTimePreview, setCurrentTimePreview] = useState<string>('');

  // Keep local state synchronized with global timezone
  useEffect(() => {
    setSelectedTz(timezone);
  }, [timezone]);

  // Live preview clock of the selected timezone
  useEffect(() => {
    const updatePreview = () => {
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: selectedTz,
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZoneName: 'short',
        }).format(now);
        setCurrentTimePreview(formatted);
      } catch {
        setCurrentTimePreview('');
      }
    };

    updatePreview();
    const interval = setInterval(updatePreview, 1000);
    return () => clearInterval(interval);
  }, [selectedTz]);

  const handleSave = async () => {
    if (selectedTz === timezone) return;
    setIsSaving(true);
    try {
      await setTimezone(selectedTz);
      toast.success(`Site-wide timezone updated to ${selectedTz}`);
    } catch (err: any) {
      console.error('Failed to update timezone:', err);
      toast.error(err.message || 'Failed to update timezone');
      setSelectedTz(timezone); // Revert on failure
    } finally {
      setIsSaving(false);
    }
  };

  // Group timezones by region
  const groupedTimezones = availableTimezones.reduce<Record<string, typeof availableTimezones>>((acc, tz) => {
    const region = tz.region || 'Other';
    if (!acc[region]) acc[region] = [];
    acc[region].push(tz);
    return acc;
  }, {});

  if (loading && availableTimezones.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        Loading timezone configuration...
      </div>
    );
  }

  const hasChanged = selectedTz !== timezone;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '650px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label 
          htmlFor="site-timezone-select" 
          style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: '130px', color: 'var(--vtr-theme-text, #fff)' }}
        >
          Site Timezone:
        </label>
        
        <select
          id="site-timezone-select"
          value={selectedTz}
          onChange={(e) => setSelectedTz(e.target.value)}
          disabled={!isAdmin || isSaving}
          className="vtr-input"
          style={{ 
            flex: '1', 
            minWidth: '260px', 
            cursor: isAdmin ? 'pointer' : 'not-allowed',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            background: 'var(--vtr-input-bg, rgba(0,0,0,0.4))',
            color: 'var(--vtr-theme-text, #fff)',
            border: '1px solid var(--vtr-card-border, #333)'
          }}
        >
          {Object.entries(groupedTimezones).map(([region, tzs]) => (
            <optgroup key={region} label={region}>
              {tzs.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.name} ({tz.offset})
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={!hasChanged || isSaving}
            className="vtr-btn vtr-btn-primary"
            style={{
              padding: '0.6rem 1.25rem',
              opacity: hasChanged && !isSaving ? 1 : 0.5,
              cursor: hasChanged && !isSaving ? 'pointer' : 'default',
            }}
          >
            {isSaving ? 'Saving...' : 'Apply Timezone'}
          </button>
        )}
      </div>

      {/* Live Preview Box */}
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--vtr-card-border, rgba(255,255,255,0.1))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.875rem',
        fontFamily: 'var(--font-mono)'
      }}>
        <div style={{ color: 'var(--vtr-theme-neutral, #888)' }}>
          Current Time in <span style={{ color: 'var(--vtr-theme-primary, #60a5fa)', fontWeight: 600 }}>{selectedTz}</span>:
        </div>
        <div style={{ color: 'var(--vtr-theme-primary, #60a5fa)', fontWeight: 'bold' }}>
          {currentTimePreview || 'Calculating...'}
        </div>
      </div>

      {!isAdmin && (
        <div style={{ fontSize: '0.8rem', color: 'var(--vtr-theme-neutral, #888)', fontStyle: 'italic' }}>
          * Administrator privileges are required to modify the site-wide timezone.
        </div>
      )}
    </div>
  );
};
