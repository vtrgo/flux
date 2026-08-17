import { ThemeSelector } from "../../components/ThemeSelector";
import Link from 'next/link';

export default function AdminPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', paddingBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--vtr-theme-primary, var(--text-primary))', margin: 0 }}>
            Admin Portal
          </h1>
          <p style={{ color: 'var(--vtr-theme-accent, var(--text-secondary))', fontFamily: 'var(--font-mono)', fontSize: '1rem', marginTop: '0.5rem' }}>
            System Configurations & Settings
          </p>
        </div>
        <Link href="/" className="vtr-btn vtr-btn-secondary">
          ← Back to Dashboard
        </Link>
      </header>

      <section style={{ 
        backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
        border: '1px solid var(--vtr-card-border, var(--border-color))',
        borderRadius: '12px',
        padding: '2rem',
        backdropFilter: 'blur(8px)',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', color: 'var(--vtr-theme-primary, var(--text-primary))', marginBottom: '1.5rem' }}>
          Global Theme Configuration
        </h2>
        <p style={{ color: 'var(--vtr-theme-neutral, var(--text-secondary))', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Select the active VTR brand theme. This configuration is globally applied across the entire execution system.
        </p>
        <div style={{ display: 'inline-block', padding: '1rem', border: '1px solid var(--vtr-card-border, var(--border-color))', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
          <ThemeSelector />
        </div>
      </section>

      <section style={{ 
        backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
        border: '1px solid var(--vtr-card-border, var(--border-color))',
        borderRadius: '12px',
        padding: '2rem',
        backdropFilter: 'blur(8px)',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', color: 'var(--vtr-theme-primary, var(--text-primary))', marginBottom: '1.5rem' }}>
          Observability & Diagnostics
        </h2>
        <p style={{ color: 'var(--vtr-theme-neutral, var(--text-secondary))', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Monitor system health, access real-time server logs, and review user audit activity securely.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/logs?preset=user" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            User Logs
          </Link>
          <Link href="/admin/logs?preset=system" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            System Logs
          </Link>
        </div>
      </section>
    </main>
  );
}
