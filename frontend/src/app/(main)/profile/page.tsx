"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchApi } from '../../../lib/api';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchApi('auth/change_password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        })
      });

      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err.message || 'Failed to update password';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  const isExternalAccount = user.auth_provider && user.auth_provider !== 'local';

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem', 
        borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', 
        paddingBottom: '1.5rem' 
      }}>
        <div>
          <h1 style={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: '2rem', 
            fontWeight: 700, 
            textTransform: 'uppercase', 
            color: 'var(--vtr-theme-primary, var(--text-primary))', 
            margin: 0 
          }}>
            User Profile & Security
          </h1>
          <p style={{ 
            color: 'var(--vtr-theme-accent, var(--text-secondary))', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '0.9rem', 
            marginTop: '0.5rem' 
          }}>
            Account Settings & Password Management
          </p>
        </div>
        <Link href="/" className="vtr-btn vtr-btn-secondary">
          &larr; Back to Dashboard
        </Link>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Account Details Card */}
        <section style={{
          backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
          border: '1px solid var(--vtr-card-border, var(--border-color))',
          borderRadius: '12px',
          padding: '2rem',
          backdropFilter: 'blur(8px)'
        }}>
          <h2 style={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: '1.25rem', 
            color: 'var(--vtr-theme-primary, var(--text-primary))', 
            marginBottom: '1.25rem',
            textTransform: 'uppercase'
          }}>
            Account Information
          </h2>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1.5rem' 
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Username
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {user.username}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Email Address
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {user.email || '—'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Full Name
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '—'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Department
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem', textTransform: 'capitalize' }}>
                {user.department || 'Unassigned'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Assigned Role
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem', textTransform: 'uppercase' }}>
                {user.role || 'User'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Authentication Type
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem', textTransform: 'uppercase' }}>
                {user.auth_provider || 'local'}
              </div>
            </div>
          </div>
        </section>

        {/* Change Password Card */}
        <section style={{
          backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
          border: '1px solid var(--vtr-card-border, var(--border-color))',
          borderRadius: '12px',
          padding: '2rem',
          backdropFilter: 'blur(8px)'
        }}>
          <h2 style={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: '1.25rem', 
            color: 'var(--vtr-theme-primary, var(--text-primary))', 
            marginBottom: '1rem',
            textTransform: 'uppercase'
          }}>
            Security & Credentials
          </h2>

          {isExternalAccount ? (
            <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
              Your account is managed via corporate Active Directory / Single Sign-On. Passwords must be updated through your IT domain management portal.
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Update your account password. Ensure your new password is at least 6 characters long.
              </p>

              {errorMessage && (
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  color: 'var(--accent-red, #ff4d4d)',
                  backgroundColor: 'rgba(255, 77, 77, 0.1)',
                  border: '1px solid rgba(255, 77, 77, 0.3)',
                  padding: '0.75rem 1rem',
                  borderRadius: '4px',
                  marginBottom: '1.5rem'
                }} role="alert">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '400px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label htmlFor="currentPassword" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Current Password
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="vtr-input"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label htmlFor="newPassword" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    New Password (Min 6 Characters)
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="vtr-input"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label htmlFor="confirmPassword" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="vtr-input"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  className="vtr-btn"
                  style={{ alignSelf: 'flex-start', marginTop: '0.5rem', padding: '0.6rem 1.25rem' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating Password...' : 'Save New Password'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
