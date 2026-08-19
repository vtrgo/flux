"use client";

import { useState, useEffect } from 'react';
import { usePublicDashboardData } from '../../hooks/usePublicDashboardData';
import styles from './display.module.css';

import { Logo } from '../../components/Logo';
import { HeaderMetric } from '../../components/HeaderMetric';
import { DisplayMachineRow } from '../../components/DisplayMachineRow';

const CYCLE_DURATION_MS = 10000; // 10 seconds per slide

export default function DisplayDashboard() {
  const { projects, loading, error } = usePublicDashboardData();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!projects || projects.length <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % projects.length);
      setProgress(0); // reset progress bar
    }, CYCLE_DURATION_MS);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + (100 / (CYCLE_DURATION_MS / 100)), 100));
    }, 100);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [projects]);

  if (loading && projects.length === 0) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--vtr-theme-bg)', color: 'white' }}>
        <h1 style={{ fontSize: '3rem' }}>Loading Dashboard...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--vtr-theme-bg)', color: '#ef4444' }}>
        <h1 style={{ fontSize: '3rem' }}>Error: {error}</h1>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--vtr-theme-bg)', color: 'white' }}>
        <h1 style={{ fontSize: '4rem' }}>No Active Projects</h1>
      </div>
    );
  }

  const currentProject = projects[activeIndex];
  const targetDate = currentProject.target_ship_date ? new Date(currentProject.target_ship_date).toLocaleDateString() : 'TBD';

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: 'var(--vtr-theme-bg)', 
      color: 'var(--vtr-theme-text)',
      fontFamily: 'sans-serif',
      overflow: 'hidden'
    }}>
      
      {/* Animated Wrapper keyed by project ID so React remounts it */}
      <div key={currentProject.id} className={styles.carouselWrapper}>
        
        {/* Header section */}
        <header style={{ 
          padding: '2rem 4rem', 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '3rem', alignItems: 'center' }}>
            <Logo width={65} height={65} />
            <div style={{ borderLeft: '2px solid var(--vtr-theme-border)', paddingLeft: '3rem' }}>
              <h1 style={{ fontSize: '4rem', margin: 0, fontWeight: 'bold' }}>
                {currentProject.internal_project_number && `${currentProject.internal_project_number} `}
                {currentProject.customer_name}
                {currentProject.project_name && ` (${currentProject.project_name})`}
              </h1>
              <div style={{ fontSize: '1.5rem', color: 'var(--vtr-theme-text-muted)', marginTop: '0.75rem', display: 'flex', gap: '2rem' }}>
                <span><strong style={{color: 'white'}}>PO:</strong> {currentProject.po_number}</span>
                {currentProject.responsible_person && <span><strong style={{color: 'white'}}>Lead:</strong> {currentProject.responsible_person}</span>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: '3rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <HeaderMetric title="Open" value={currentProject.defects.total_open} color="#ef4444" />
              <HeaderMetric title="Pending" value={currentProject.defects.total_pending} color="#eab308" />
              <HeaderMetric title="Closed" value={currentProject.defects.total_closed} color="#22c55e" />
            </div>
            <div style={{ borderLeft: '2px solid var(--vtr-theme-border)', paddingLeft: '3rem' }}>
              <span style={{ fontSize: '1.5rem', textTransform: 'uppercase', color: 'var(--vtr-theme-text-muted)' }}>Target Ship Date</span>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--vtr-theme-primary)' }}>{targetDate}</div>
            </div>
          </div>
        </header>

        <hr style={{ width: '80%', border: 'none', borderTop: '2px solid var(--vtr-theme-border)', margin: '0 auto', opacity: 0.6 }} />

        {/* Main Content / Machine Details List */}
        <main style={{ 
          flex: 1, 
          padding: '2rem 4rem',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {currentProject.machines && currentProject.machines.map((machine) => (
              <DisplayMachineRow key={machine.id} machine={machine} />
            ))}
            {(!currentProject.machines || currentProject.machines.length === 0) && (
              <div style={{ fontSize: '1.5rem', color: 'var(--vtr-theme-text-muted)', textAlign: 'center', marginTop: '4rem' }}>
                No machines found for this project.
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer / Progress Bar */}
      <footer style={{ position: 'relative', padding: '1.5rem 4rem', borderTop: '2px solid var(--vtr-theme-border)', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--vtr-theme-text-muted)' }}>
          Project {activeIndex + 1} of {projects.length}
        </div>
        <div style={{ fontSize: '1.25rem', color: 'var(--vtr-theme-text-muted)' }}>
          Live Pipeline View
        </div>
        
        {/* Animated Progress Bar at the very bottom edge */}
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          height: '8px', 
          background: 'var(--vtr-theme-primary)', 
          width: `${progress}%`,
          transition: 'width 100ms linear'
        }} />
      </footer>
    </div>
  );
}
