"use client";

import Link from "next/link";

export default function KeyboardShortcutsManual() {
  const shortcuts = [
    {
      scope: "Global",
      commands: [
        { keys: ["Cmd/Ctrl", "K"], description: "Open Command Palette to navigate or search." },
      ],
    },
    {
      scope: "Forms & Data Entry",
      commands: [
        { keys: ["Cmd/Ctrl", "Enter"], description: "Submit forms quickly (e.g., creating a new sales order) without clicking submit." },
      ],
    },
    {
      scope: "Modals & Popups",
      commands: [
        { keys: ["Esc"], description: "Close active modals, dialogs, or the Command Palette." },
      ],
    },
  ];

  return (
    <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/admin" className="vtr-btn vtr-btn-secondary" style={{ textDecoration: 'none' }}>
            &larr; Back to Admin
          </Link>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--vtr-theme-primary, var(--text-primary))', margin: 0 }}>Keyboard Shortcuts Manual</h1>
        </div>
      </header>

      <section style={{ 
        backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
        border: '1px solid var(--vtr-card-border, var(--border-color))',
        borderRadius: '12px',
        padding: '2rem',
        backdropFilter: 'blur(8px)',
        maxWidth: '800px', 
        margin: '0 auto' 
      }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Welcome to the robust keyboard-driven user experience. Below is the documentation of all available shortcuts across the system to help you operate at high speed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {shortcuts.map((section) => (
            <div key={section.scope}>
              <h2 style={{ color: 'var(--vtr-theme-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                {section.scope}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {section.commands.map((cmd, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', minWidth: '150px' }}>
                      {cmd.keys.map((k, kIdx) => (
                        <span key={kIdx} style={{ 
                          background: 'var(--vtr-card-bg)', 
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
