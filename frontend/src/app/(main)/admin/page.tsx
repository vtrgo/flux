import { ThemeSelector } from "../../../components/ThemeSelector";
import { TimezoneSelector } from "../../../components/TimezoneSelector";
import Link from 'next/link';
import styles from "./admin.module.css";

export default function AdminPage() {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Portal</h1>
          <p className={styles.subtitle}>System Configurations & Settings</p>
        </div>
        <Link href="/" className="vtr-btn vtr-btn-secondary">
          ← Back to Dashboard
        </Link>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Global Theme Configuration</h2>
        <p className={styles.cardDescription}>
          Select the active VTR brand theme. This configuration is globally applied across the entire execution system.
        </p>
        <div style={{ display: 'inline-block', padding: '1rem', border: '1px solid var(--border-default, #333)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
          <ThemeSelector />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Site Time & Date Configuration</h2>
        <p className={styles.cardDescription}>
          Configure the primary site-wide timezone for the factory floor. This setting governs calendar date calculations, F.A.T. schedule lateness, shop floor display clocks, and audit timestamps across all devices.
        </p>
        <div style={{ padding: '1.25rem', border: '1px solid var(--border-default, #333)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
          <TimezoneSelector />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>User Administration</h2>
        <p className={styles.cardDescription}>
          Manage user accounts, roles, and department assignments.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/users" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            Manage Users →
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Observability & Diagnostics</h2>
        <p className={styles.cardDescription}>
          Monitor system health, access real-time server logs, and review user audit activity securely.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/logs" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            View Live Server Logs →
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Releases & Deployment Management</h2>
        <p className={styles.cardDescription}>
          Inspect active build versions, git commits, published release tags, and trigger testing or production deployment pipelines.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/releases" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            Release Management & Pipeline →
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>System Documentation</h2>
        <p className={styles.cardDescription}>
          Reference manuals and guides for efficiently operating the system.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/keyboard-shortcuts" className="vtr-btn vtr-btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
            Keyboard Shortcuts Manual →
          </Link>
        </div>
      </section>
    </main>
  );
}
