"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { toast } from 'sonner';

interface ReleaseTag {
  tag: string;
  date: string;
  subject: string;
}

interface SystemVersionInfo {
  version: string;
  commit: string;
  build_date: string;
  environment: string;
  database_online: boolean;
  git_branch?: string;
  recent_releases: ReleaseTag[];
  deploy_script_path: string;
}

export default function AdminReleasesPage() {
  const [data, setData] = useState<SystemVersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVersionInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<SystemVersionInfo>('system/version');
      setData(res);
    } catch (err: any) {
      console.error('Failed to fetch release info:', err);
      setError(err.message || 'Could not fetch version metadata');
      toast.error('Failed to load release status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersionInfo();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
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
            Releases & Deployment Management
          </h1>
          <p style={{ 
            color: 'var(--vtr-theme-accent, var(--text-secondary))', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '0.95rem', 
            marginTop: '0.5rem' 
          }}>
            Release tracking, version telemetry, and deployment operations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={loadVersionInfo} 
            className="vtr-btn vtr-btn-secondary" 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          >
            ↻ Refresh Status
          </button>
          <Link href="/admin" className="vtr-btn vtr-btn-secondary">
            &larr; Back to Admin
          </Link>
        </div>
      </header>

      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading release & environment telemetry...
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          padding: '1.5rem',
          background: 'rgba(255, 77, 77, 0.1)',
          border: '1px solid rgba(255, 77, 77, 0.3)',
          color: 'var(--accent-red, #ff4d4d)',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Active Runtime Status Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
            gap: '1.25rem' 
          }}>
            {/* Current Active Version */}
            <div style={{
              backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
              border: '1px solid var(--vtr-card-border, var(--border-color))',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Active Build Version
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--vtr-theme-primary, var(--accent-cyan))' }}>
                {data.version}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Commit: <code>{data.commit}</code>
              </span>
            </div>

            {/* Runtime Environment */}
            <div style={{
              backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
              border: '1px solid var(--vtr-card-border, var(--border-color))',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Execution Environment
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: data.environment === 'production' ? 'var(--accent-green, #00ff00)' : 'var(--accent-amber, #ffb000)',
                  boxShadow: `0 0 8px ${data.environment === 'production' ? 'var(--accent-green, #00ff00)' : 'var(--accent-amber, #ffb000)'}`
                }}></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {data.environment}
                </span>
              </div>
              {data.git_branch && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Branch: <code>{data.git_branch}</code>
                </span>
              )}
            </div>

            {/* Build Timestamp */}
            <div style={{
              backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
              border: '1px solid var(--vtr-card-border, var(--border-color))',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Build Date
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                {data.build_date !== 'unknown' ? data.build_date : 'Locally Executed / Dev'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Target: <code>Single-Executable (Go:Embed)</code>
              </span>
            </div>

            {/* Database Health */}
            <div style={{
              backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
              border: '1px solid var(--vtr-card-border, var(--border-color))',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Relational Engine (Postgres)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: data.database_online ? 'var(--accent-green, #00ff00)' : 'var(--accent-red, #ff4d4d)',
                  boxShadow: `0 0 8px ${data.database_online ? 'var(--accent-green, #00ff00)' : 'var(--accent-red, #ff4d4d)'}`
                }}></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 600 }}>
                  {data.database_online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Pool: Active & Verified
              </span>
            </div>
          </div>

          {/* Published Milestone Release Tags */}
          <section style={{
            backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
            border: '1px solid var(--vtr-card-border, var(--border-color))',
            borderRadius: '12px',
            padding: '2rem',
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', color: 'var(--vtr-theme-primary, var(--text-primary))', margin: 0 }}>
                  Published Release Tags & Milestones
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Version tags configured in git for triggering automated builds & production rollouts
                </p>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {data.recent_releases.length} tags tracked
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0' }}>Release Tag</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Tagged Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Changelog / Release Summary</th>
                  <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_releases.map((rel) => (
                  <tr key={rel.tag} style={{ borderBottom: '1px solid var(--vtr-card-border, var(--border-color))' }}>
                    <td style={{ padding: '1rem 0' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        color: 'var(--vtr-theme-primary, var(--accent-cyan))',
                        background: 'rgba(0, 229, 255, 0.08)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid rgba(0, 229, 255, 0.2)'
                      }}>
                        {rel.tag}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {rel.date || '—'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {rel.subject || 'Milestone release'}
                    </td>
                    <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                      <button 
                        onClick={() => copyToClipboard(`sudo ./scripts/deploy_production.sh ${rel.tag}`, rel.tag)}
                        className="vtr-btn vtr-btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        title="Copy deploy command for this tag"
                      >
                        Copy Deploy Command
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Testing & Release Operations Playbook */}
          <section style={{
            backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
            border: '1px solid var(--vtr-card-border, var(--border-color))',
            borderRadius: '12px',
            padding: '2rem',
            backdropFilter: 'blur(8px)'
          }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', color: 'var(--vtr-theme-primary, var(--text-primary))', marginBottom: '1rem' }}>
              Testing & Release Workflow Guide
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6, fontSize: '0.9rem' }}>
              Standard operating procedures for validating code quality during testing and promoting release candidate tags to production.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {/* Step 1 */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--vtr-card-border, var(--border-color))',
                borderRadius: '8px',
                padding: '1.25rem'
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--vtr-theme-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  STEP 1: Run Full Verification Suite
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Executes Go unit tests, linter, frontend type integrity, Vitest suite, and builds single executable:
                </p>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0a0a0a',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem'
                }}>
                  <code>./scripts/test.sh</code>
                  <button 
                    onClick={() => copyToClipboard('./scripts/test.sh', 'test command')}
                    className="vtr-btn vtr-btn-secondary"
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--vtr-card-border, var(--border-color))',
                borderRadius: '8px',
                padding: '1.25rem'
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-amber)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  STEP 2: Cut & Push Release Tag
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Creating and pushing a version tag automatically triggers GitHub Actions to compile and publish artifacts:
                </p>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0a0a0a',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem'
                }}>
                  <code>git tag -a v1.4.1 -m &quot;Release v1.4.1&quot; &amp;&amp; git push origin v1.4.1</code>
                  <button 
                    onClick={() => copyToClipboard('git tag -a v1.4.1 -m "Release v1.4.1" && git push origin v1.4.1', 'git tag command')}
                    className="vtr-btn vtr-btn-secondary"
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--vtr-card-border, var(--border-color))',
                borderRadius: '8px',
                padding: '1.25rem'
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  STEP 3: Production Rollout & Migration
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Restores service, applies new DB migrations, and validates health on systemd:
                </p>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0a0a0a',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem'
                }}>
                  <code>sudo ./scripts/deploy_production.sh latest</code>
                  <button 
                    onClick={() => copyToClipboard('sudo ./scripts/deploy_production.sh latest', 'deploy command')}
                    className="vtr-btn vtr-btn-secondary"
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
