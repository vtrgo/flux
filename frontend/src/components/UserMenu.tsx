"use client";

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi } from '../lib/api';
import { toast } from 'sonner';

export function UserMenu() {
  const { user, logout, login, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const data = await fetchApi('auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (data && data.id) {
        login(data);
        setIsOpen(false);
        setUsername('');
        setPassword('');
        toast.success(`Welcome, ${data.username}!`);
      }
    } catch (err: any) {
      toast.error('Invalid username or password');
    }
    setIsLoggingIn(false);
  };

  if (loading) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--vtr-theme-primary)' }}>
            {user.username}
          </span>
          <button onClick={logout} className="vtr-btn vtr-btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
            Logout
          </button>
        </div>
      ) : (
        <>
          <button onClick={() => setIsOpen(!isOpen)} className="vtr-btn" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Sign In
          </button>
          
          {isOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              right: 0,
              background: 'var(--vtr-card-bg, #1a1a1a)',
              border: '1px solid var(--vtr-card-border, #333)',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '250px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 100
            }}>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="vtr-input"
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="vtr-input"
                    required
                  />
                </div>
                <button type="submit" className="vtr-btn" disabled={isLoggingIn}>
                  {isLoggingIn ? 'Logging In...' : 'Login'}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
