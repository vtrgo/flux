"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useInAppAlerts } from '../hooks/useInAppAlerts';
import { InAppAlert } from '../types';

function formatRelativeTime(dateString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return 'Recently';
  }
}

function getSeverityStyle(severity: string) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return { color: 'var(--accent-red, #ff3366)', border: '1px solid rgba(255, 51, 102, 0.4)', bg: 'rgba(255, 51, 102, 0.12)' };
    case 'moderate':
      return { color: 'var(--accent-amber, #ffb000)', border: '1px solid rgba(255, 176, 0, 0.4)', bg: 'rgba(255, 176, 0, 0.12)' };
    case 'minor':
      return { color: 'var(--accent-cyan, #00e5ff)', border: '1px solid rgba(0, 229, 255, 0.4)', bg: 'rgba(0, 229, 255, 0.12)' };
    default:
      return { color: 'var(--accent-green, #00ff00)', border: '1px solid rgba(0, 255, 0, 0.4)', bg: 'rgba(0, 255, 0, 0.12)' };
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { alerts, unreadCount, markAsRead, markAllAsRead, clearAlerts, isConnected } = useInAppAlerts();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleAlertClick = (alert: InAppAlert) => {
    markAsRead(alert.id);
    setIsOpen(false);

    if (alert.machine_id) {
      router.push(`/machine?id=${alert.machine_id}`);
    } else {
      router.push('/quality');
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        style={{
          background: 'none',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          padding: '0.45rem',
          cursor: 'pointer',
          color: unreadCount > 0 ? 'var(--vtr-theme-primary)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'all 0.2s ease',
        }}
        title="In-App Alert History"
      >
        {/* Bell SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              background: 'var(--accent-red, #ff3366)',
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              borderRadius: '10px',
              padding: '0.1rem 0.35rem',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 8px rgba(255, 51, 102, 0.6)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxHeight: '480px',
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--vtr-card-border, var(--border-color))',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                ALERT HISTORY
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: isConnected ? 'var(--accent-green, #00ff00)' : 'var(--accent-amber, #ffb000)',
                }}
                title={isConnected ? "Realtime SSE Connected" : "Connecting to SSE stream..."}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isConnected ? 'var(--accent-green, #00ff00)' : 'var(--accent-amber, #ffb000)',
                    display: 'inline-block',
                  }}
                />
                {isConnected ? 'LIVE' : 'SYNCING'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--vtr-theme-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Mark all read
                </button>
              )}
              {alerts.length > 0 && (
                <button
                  type="button"
                  onClick={clearAlerts}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Alert List */}
          <div style={{ overflowY: 'auto', maxHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            {alerts.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>🔔</div>
                No notifications logged yet.<br />
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Live quality events will appear here.</span>
              </div>
            ) : (
              alerts.map(alert => {
                const badge = getSeverityStyle(alert.severity);
                return (
                  <div
                    key={alert.id}
                    onClick={() => handleAlertClick(alert)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      background: alert.read ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
                      transition: 'background 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      position: 'relative',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = alert.read ? 'transparent' : 'rgba(255, 255, 255, 0.03)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '2px',
                            color: badge.color,
                            border: badge.border,
                            background: badge.bg,
                            fontWeight: 600,
                          }}
                        >
                          {(alert.severity || 'ALERT').toUpperCase()}
                        </span>
                        <strong style={{ fontSize: '0.8rem', color: alert.read ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {alert.title}
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {formatRelativeTime(alert.created_at)}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {alert.description}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {alert.department && (
                        <span>Dept: <strong style={{ color: 'var(--text-primary)' }}>{alert.department}</strong></span>
                      )}
                      {!alert.read && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--vtr-theme-primary)', marginLeft: 'auto' }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
