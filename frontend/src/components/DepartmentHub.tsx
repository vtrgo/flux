"use client";

import { useState, useRef } from "react";
import { fetchApi } from "../lib/api";
import { useDepartmentIssues } from "../hooks/useDepartmentIssues";
import Link from "next/link";
import styles from "../app/quality/quality.module.css";
import { IssueModal } from "./IssueModal";
import { IssueCard } from "./IssueCard";
import { FilterButtonGroup } from "./FilterButtonGroup";
import { useAppHotkeys } from "../hooks/useAppHotkeys";

import { Defect } from "../types";

interface DepartmentHubProps {
  title: string;
  departmentKey: string;
}

export function DepartmentHub({ title, departmentKey }: DepartmentHubProps) {
  const { issues, loading } = useDepartmentIssues(departmentKey);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeverity, setActiveSeverity] = useState<string>("All");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const openNewModal = () => {
    setEditingDefect(null);
    setIsModalOpen(true);
  };

  useAppHotkeys('/', (e) => {
    e.preventDefault();
    searchInputRef.current?.focus();
  });

  useAppHotkeys('c', (e) => {
    e.preventDefault();
    openNewModal();
  });

  const openEditModal = (defect: Defect, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingDefect(defect);
    setIsModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, defectId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this issue?")) return;
    try {
      await fetchApi(`defects/${defectId}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete defect", err);
    }
  };

  const handleStatusChange = async (e: React.MouseEvent, defect: Defect, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetchApi(`defects/${defect.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (loading) return <div className={styles.loading}>LOADING {title.toUpperCase()}...</div>;

  const uniqueSeverities = Array.from(new Set(issues.map(d => d.severity))).filter(Boolean);

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = 
      searchQuery === "" || 
      issue.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.order_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = activeSeverity === "All" || issue.severity === activeSeverity;

    return matchesSearch && matchesSeverity;
  });

  const issuesByMachine = filteredIssues.reduce((acc, issue) => {
    if (!acc[issue.machine_id]) {
      acc[issue.machine_id] = { order_number: issue.order_number, issues: [] };
    }
    acc[issue.machine_id].issues.push(issue);
    return acc;
  }, {} as Record<string, { order_number: string, issues: Defect[] }>);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>{title}</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="vtr-btn" onClick={openNewModal} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <span>+ ADD ISSUE</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, textTransform: 'none' }}>(Press &apos;C&apos;)</span>
          </button>
          <Link href="/" className="vtr-btn vtr-btn-secondary">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div className={styles.filters}>
        <input 
          ref={searchInputRef}
          type="text" 
          placeholder="Search description or order..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setSearchQuery('');
          }}
          className="vtr-input"
          style={{ flex: 1, minWidth: '200px', maxWidth: '300px' }}
        />
        
        {uniqueSeverities.length > 0 && (
          <FilterButtonGroup 
            options={["All", ...uniqueSeverities]} 
            activeOption={activeSeverity} 
            onChange={setActiveSeverity} 
            label="Severity" 
          />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginBottom: '3rem' }}>
        {Object.entries(issuesByMachine).length === 0 ? (
          <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No assigned issues.</p>
        ) : Object.entries(issuesByMachine).map(([machineId, group]) => {
          const openF = group.issues.filter(f => f.status === 'open');
          const fixedF = group.issues.filter(f => f.status === 'fixed');
          const verifiedF = group.issues.filter(f => f.status === 'verified');
          
          return (
            <div key={machineId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>{group.order_number} <span className={styles.badge}>{group.issues.length}</span></h2>
                <Link href={`/machine?id=${machineId}`} className="vtr-btn vtr-btn-secondary">{group.order_number} Portal →</Link>
              </div>
              <div className={styles.grid}>
                {/* OPEN COLUMN */}
                <section className={styles.column}>
                  <h3>Open Issues <span className={styles.badge}>{openF.length}</span></h3>
                  <div className={styles.list}>
                    {openF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No open issues.</p>
                    ) : openF.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => openEditModal(issue)}
                        actions={
                          <>
                            <button className="vtr-btn" style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'fixed')}>MARK FIXED</button>
                            <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                          </>
                        }
                      />
                    ))}
                  </div>
                </section>

                {/* FIXED COLUMN */}
                <section className={styles.column}>
                  <h3>Fixed (Pending Sign-off) <span className={styles.badge}>{fixedF.length}</span></h3>
                  <div className={styles.list}>
                    {fixedF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No issues pending verification.</p>
                    ) : fixedF.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => openEditModal(issue)}
                        cardStyle={{ borderColor: 'var(--accent-amber)' }}
                        actions={
                          <>
                            <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-green)', color: 'var(--accent-green)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'verified')}>SIGN OFF</button>
                            <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'open')}>REJECT</button>
                            <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                          </>
                        }
                      />
                    ))}
                  </div>
                </section>

                {/* VERIFIED COLUMN */}
                <section className={styles.column}>
                  <h3>Verified & Cleared <span className={styles.badge}>{verifiedF.length}</span></h3>
                  <div className={styles.list}>
                    {verifiedF.length === 0 ? (
                      <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No completed issues.</p>
                    ) : verifiedF.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => openEditModal(issue)}
                        cardStyle={{ opacity: 0.6, cursor: 'pointer' }}
                        actions={
                          <>
                            <button className="vtr-btn" style={{ flex: 1, borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleStatusChange(e, issue, 'open')}>RE-OPEN</button>
                            <button className="vtr-btn" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '0.25rem', fontSize: '0.75rem' }} onClick={(e) => handleDelete(e, issue.id)}>🗑️</button>
                          </>
                        }
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          );
        })}
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect}
        defaultAssignedDept={departmentKey}
      />
    </main>
  );
}
