"use client";

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from './Logo';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const redirectUrl = pathname && pathname !== '/' 
        ? `/login?from=${encodeURIComponent(pathname)}` 
        : '/login';
      router.replace(redirectUrl);
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        background: 'var(--bg-primary, #121212)'
      }}>
        <div style={{ animation: 'spin 4s linear infinite' }}>
          <Logo width={48} height={48} />
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Verifying MES Access Credentials...
        </div>
      </div>
    );
  }

  // If not authenticated, render nothing while router redirects
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
