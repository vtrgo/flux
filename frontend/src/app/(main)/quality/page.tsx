"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSSE } from "../../../components/SSEProvider";
import { fetchApi } from "../../../lib/api";
import Link from "next/link";
import styles from "./quality.module.css";
import { Machine, Defect, NCR } from "../../../types";

import { IssueModal } from "../../../components/IssueModal";
import { NCRModal } from "../../../components/NCRModal";
import { IssueCardItem } from "../../../components/IssueCardItem";
import { AttachmentViewer } from "../../../components/AttachmentViewer";
import { FilterButtonGroup } from "../../../components/FilterButtonGroup";
import { useAppHotkeys } from "../../../hooks/useAppHotkeys";
import { formatDepartmentName } from "../../../lib/departments";

export default function QualityResolutionHub() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  const [isNCRModalOpen, setIsNCRModalOpen] = useState(false);
  const [editingNCR, setEditingNCR] = useState<NCR | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDepartment, setActiveDepartment] = useState<string>("All");
  const [activeSeverity, setActiveSeverity] = useState<string>("All");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      const [defRes, macRes] = await Promise.all([
        fetchApi<Defect[]>(`defects`),
        fetchApi<Machine[]>(`machines`)
      ]);
      setDefects(defRes || []);
      setMachines(macRes || []);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  useSSE('defect_updated', (updatedDefect: Defect) => {
    setDefects(prev => prev.map(d => 
      d.id === updatedDefect.id ? { ...updatedDefect, order_number: d.order_number } : d
    ));
  });

  useSSE('defect_added', () => fetchData());
  
  useSSE('defect_deleted', (deleted: { id: string }) => {
    setDefects(prev => prev.filter(d => d.id !== deleted.id));
  });

  useSSE('machine_created', () => fetchData());
  useSSE('machine_deleted', () => fetchData());

  useEffect(() => {
    fetchData();
  }, []);

  const openNewModal = () => {
    setEditingDefect(null);
    setIsModalOpen(true);
  };

  const openNewNCRModal = () => {
    setEditingNCR(null);
    setIsNCRModalOpen(true);
  };

  useAppHotkeys('/', (e) => {
    e.preventDefault();
    searchInputRef.current?.focus();
  });

  useAppHotkeys('c', (e) => {
    e.preventDefault();
    openNewModal();
  });

  const openEditModal = useCallback((defect: Defect) => {
    setEditingDefect(defect);
    setIsModalOpen(true);
  }, []);

  const handleCardClick = useCallback((defect: Defect) => {
    if (defect.is_ncr) {
      setEditingNCR(defect as NCR);
      setIsNCRModalOpen(true);
    } else {
      openEditModal(defect);
    }
  }, [openEditModal]);

  const handleDelete = useCallback(async (e: React.MouseEvent, defectId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this issue?")) return;
    try {
      await fetchApi(`defects/${defectId}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete defect", err);
    }
  }, []);

  const handleStatusChange = useCallback(async (e: React.MouseEvent, defect: Defect, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetchApi(`defects/${defect.id}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          status: nextStatus,
          assigned_department: defect.assigned_department
        })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  }, []);

  const uniqueAssignedDepts = Array.from(new Set(defects.map(d => d.assigned_department))).filter(Boolean);
  const uniqueSeverities = Array.from(new Set(defects.map(d => d.severity))).filter(Boolean);

  const filteredDefects = defects.filter(defect => {
    const matchesSearch = 
      searchQuery === "" || 
      defect.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      defect.order_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAssignedDept = activeDepartment === "All" || defect.assigned_department === activeDepartment;
    const matchesSeverity = activeSeverity === "All" || defect.severity === activeSeverity;

    return matchesSearch && matchesAssignedDept && matchesSeverity;
  });

  const openDefects = filteredDefects.filter(d => d.status === 'open');
  const fixedDefects = filteredDefects.filter(d => d.status === 'fixed');
  const verifiedDefects = filteredDefects.filter(d => d.status === 'verified');

  if (loading) return <div className={styles.loading}>INITIALIZING HUB...</div>;

  return (
    <main className={styles.container}>
      <header className={`${styles.header} no-print`}>
        <h1 className={styles.title} style={{ color: 'var(--vtr-theme-primary)' }}>Quality / PM Hub</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/ncrs" className="vtr-btn vtr-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
            📋 NCR Tracker
          </Link>
          <button className="vtr-btn" onClick={openNewNCRModal} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2, borderColor: 'var(--vtr-theme-primary)' }}>
            <span>+ CREATE NCR</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, textTransform: 'none' }}>(Non-Conformance)</span>
          </button>
          <button className="vtr-btn" onClick={openNewModal} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <span>+ ADD ISSUE</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, textTransform: 'none' }}>(Press &apos;C&apos;)</span>
          </button>
        </div>
      </header>

      <div className={`${styles.filters} no-print`}>
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
        
        {uniqueAssignedDepts.length > 0 && (
          <FilterButtonGroup 
            options={["All", ...uniqueAssignedDepts]} 
            activeOption={activeDepartment} 
            onChange={setActiveDepartment} 
            label="Assigned" 
            formatOption={opt => opt === "All" ? "All" : formatDepartmentName(opt)}
          />
        )}
        
        {uniqueSeverities.length > 0 && (
          <FilterButtonGroup 
            options={["All", ...uniqueSeverities]} 
            activeOption={activeSeverity} 
            onChange={setActiveSeverity} 
            label="Severity" 
          />
        )}
      </div>

      <div className={`${styles.grid} no-print`}>
        {/* OPEN COLUMN */}
        <section className={styles.column}>
          <h2>
            Open Issues
            <span className={styles.badge}>{openDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {openDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No open issues.</p>
            ) : openDefects.map(defect => (
              <IssueCardItem
                key={defect.id}
                issue={defect}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>

        {/* FIXED COLUMN */}
        <section className={styles.column}>
          <h2>
            Fixed (Pending Verification)
            <span className={styles.badge}>{fixedDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {fixedDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No fixes pending verification.</p>
            ) : fixedDefects.map(defect => (
              <IssueCardItem
                key={defect.id}
                issue={defect}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>

        {/* VERIFIED COLUMN */}
        <section className={styles.column}>
          <h2>
            Signed Off / Cleared
            <span className={styles.badge}>{verifiedDefects.length}</span>
          </h2>
          <div className={styles.list}>
            {verifiedDefects.length === 0 ? (
              <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No cleared issues.</p>
            ) : verifiedDefects.map(defect => (
              <IssueCardItem
                key={defect.id}
                issue={defect}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect} 
      />

      <NCRModal
        isOpen={isNCRModalOpen}
        onClose={() => setIsNCRModalOpen(false)}
        editingNCR={editingNCR}
        onSaved={fetchData}
      />
    </main>
  );
}
