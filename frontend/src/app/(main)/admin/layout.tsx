"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      router.replace('/');
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return null;
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        <h2 style={{ color: 'var(--accent-red, #ff4d4d)' }}>403 Forbidden</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
          Administrative privileges are required to access this portal.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
