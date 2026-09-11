"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../../components/Logo';
import { toast } from 'sonner';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fromPath, setFromPath] = useState('/');

  // Read "from" query param safely on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const target = params.get('from');
      if (target && target.startsWith('/')) {
        setFromPath(target);
      }
    }
  }, []);

  // If already logged in, redirect to intended target or dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace(fromPath);
    }
  }, [user, loading, router, fromPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const loggedInUser = await login({ username, password });
      toast.success(`Welcome, ${loggedInUser.first_name || loggedInUser.username}`);
      router.replace(fromPath);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid username or password');
      toast.error('Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          Verifying session...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo width={64} height={64} />
          <h1 className={styles.title}>vtrFlux</h1>
          <p className={styles.subtitle}>Manufacturing Execution System</p>
          <div className={styles.systemBadge}>
            <span className={styles.systemIndicator}></span>
            Core Systems Online
          </div>
        </div>

        {errorMessage && (
          <div className={styles.errorBox} role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>Username</label>
            <input
              id="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="vtr-input"
              placeholder="e.g. jdoe"
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vtr-input"
              placeholder="••••••••"
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            className={`vtr-btn ${styles.submitBtn}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In to MES'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>Corporate Single Sign-On</span>
        </div>

        <button
          type="button"
          disabled
          className={`vtr-btn vtr-btn-secondary ${styles.adButton}`}
          title="Active Directory authentication is currently parked."
        >
          Sign in with Windows AD (Pending Setup)
        </button>

        <div className={styles.footer}>
          <span>Shop floor monitor?</span>
          <Link href="/display" className={styles.footerLink}>
            Open Public Display Kiosk &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
