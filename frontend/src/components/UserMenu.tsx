"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export function UserMenu() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      router.replace('/login');
    } catch (e) {
      console.error(e);
      toast.error("Error logging out");
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        ...
      </div>
    );
  }

  if (!user) {
    return (
      <button 
        onClick={() => router.push('/login')} 
        className="vtr-btn" 
        style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
      >
        Sign In
      </button>
    );
  }

  const roleLabel = user.role ? user.role.toUpperCase() : 'USER';
  const deptLabel = user.department ? user.department.toUpperCase() : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
        <span style={{ 
          fontFamily: 'var(--font-mono)', 
          fontSize: '0.85rem', 
          fontWeight: 600,
          color: 'var(--vtr-theme-primary, var(--accent-cyan))' 
        }}>
          {user.first_name ? `${user.first_name} (${user.username})` : user.username}
        </span>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {deptLabel && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '0.1rem 0.35rem',
              borderRadius: '2px',
              border: '1px solid var(--vtr-card-border, #333)'
            }}>
              {deptLabel}
            </span>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: user.role === 'admin' ? 'var(--accent-amber, #ffb000)' : 'var(--text-secondary)',
            background: user.role === 'admin' ? 'rgba(255, 176, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)',
            padding: '0.1rem 0.35rem',
            borderRadius: '2px',
            border: `1px solid ${user.role === 'admin' ? 'rgba(255, 176, 0, 0.3)' : 'var(--vtr-card-border, #333)'}`
          }}>
            {roleLabel}
          </span>
        </div>
      </div>

      <button 
        onClick={handleLogout} 
        className="vtr-btn vtr-btn-secondary" 
        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
        title="Sign out of vtrFlux"
      >
        Logout
      </button>
    </div>
  );
}
