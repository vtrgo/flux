"use client";

import Link from "next/link";
import styles from "../admin.module.css";

export default function KeyboardShortcutsManual() {
  const shortcuts = [
    {
      scope: "Global Navigation & Actions",
      commands: [
        { keys: ["Cmd/Ctrl", "K"], description: "Open Command Palette to quickly search machines, orders, and navigate departments." },
        { keys: ["C"], description: "Quickly open new Issue creation modal from Dashboard, Department Hubs, and Quality." },
        { keys: ["/"], description: "Quickly focus the search bar on Department Hubs and tables." },
      ],
    },
    {
      scope: "Modals & Popups",
      commands: [
        { keys: ["Esc"], description: "Close active modals, preview dialogs, attachment viewers, or the Command Palette." },
        { keys: ["Cmd/Ctrl", "Enter"], description: "Quick-submit active modal forms (Issue, Sales Order, Machine, Rework, NCR) without reaching for the mouse." },
      ],
    },
    {
      scope: "Weekly Timesheet Grid",
      commands: [
        { keys: ["Cmd/Ctrl", "S"], description: "Instantly save current draft timesheet and notes." },
        { keys: ["Cmd/Ctrl", "P"], description: "Open print preview modal for landscape timesheet spooling." },
        { keys: ["Tab"], description: "Advance to the next daily hours cell or form input." },
        { keys: ["Shift", "Tab"], description: "Move back to the previous daily hours cell." },
      ],
    },
  ];

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/admin" className="vtr-btn vtr-btn-secondary" style={{ textDecoration: 'none' }}>
            &larr; Back to Admin
          </Link>
          <h1 className={styles.title}>Keyboard Shortcuts Manual</h1>
        </div>
      </header>

      <section className={styles.card} style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className={styles.cardDescription} style={{ marginBottom: '2rem' }}>
          Welcome to the robust keyboard-driven user experience. Below is the documentation of all available shortcuts across the system to help you operate at high speed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {shortcuts.map((section) => (
            <div key={section.scope}>
              <h2 style={{ color: 'var(--vtr-theme-primary)', borderBottom: '1px solid var(--border-default, #333)', paddingBottom: '0.5rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
                {section.scope}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {section.commands.map((cmd, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-base, #121212)', padding: '1rem', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border-default, #333)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', minWidth: '150px' }}>
                      {cmd.keys.map((k, kIdx) => (
                        <span key={kIdx} style={{ 
                          background: 'var(--surface-card, #1e1e1e)', 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: '4px', 
                          border: '1px solid var(--vtr-theme-primary)', 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '0.85rem',
                          color: 'var(--vtr-theme-primary)'
                        }}>
                          {k}
                        </span>
                      ))}
                    </div>
                    <span style={{ color: 'var(--text-primary)' }}>{cmd.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
