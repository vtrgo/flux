"use client";

import { DigitalClock } from '../../components/DigitalClock';

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

  const projectCount = projects?.length || 0;

  useEffect(() => {
    if (projectCount <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % projectCount);
      setProgress(0); // reset progress bar
    }, CYCLE_DURATION_MS);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + (100 / (CYCLE_DURATION_MS / 100)), 100));
    }, 100);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [projectCount]);

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
          padding: '1rem 2rem', 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-start' }}>
            <Logo width={65} height={65} />
          </div>
          
          <div style={{ flex: '2', display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
            <h1 style={{ 
              fontSize: '4rem', 
              margin: 0, 
              fontWeight: 600
            }}>
              {currentProject.internal_project_number && `${currentProject.internal_project_number} `}
              {currentProject.customer_name}
              {currentProject.project_name && ` (${currentProject.project_name})`}
            </h1>
          </div>

          <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-end' }}>
            <DigitalClock />
          </div>
        </header>

        <hr style={{ width: '80%', border: 'none', borderTop: '2px solid var(--vtr-theme-border)', margin: '0 auto', opacity: 0.6 }} />

        {/* Main Content / Layout */}
        <main style={{ 
          flex: 1, 
          padding: '1rem 2rem',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          gap: '2rem'
        }}>
          {/* Left Side: Machine Grid */}
          <div style={{ flex: '3', display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', paddingRight: '1rem' }}>
            {currentProject.machines && currentProject.machines.length > 0 ? (
              <>
                {/* CSS Grid Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px',
                  gap: '1rem',
                  padding: '0 0.5rem 0.5rem 0.5rem',
                  borderBottom: '2px solid var(--vtr-theme-border)',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  color: 'var(--vtr-theme-text-muted)',
                  fontSize: '0.85rem',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(7, 1fr)', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>Machine</div>
                    <div>Design</div>
                    <div>Kitting</div>
                    <div>Machining</div>
                    <div>Laser</div>
                    <div>Assembly</div>
                    <div>Controls</div>
                    <div>Enclosures</div>
                  </div>
                  <div>Total</div>
                </div>

                {/* Machine Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingTop: '0.5rem' }}>
                  {currentProject.machines.map((machine) => (
                    <DisplayMachineRow 
                      key={machine.id} 
                      machine={machine} 
                      departments={['design', 'kitting', 'machine_shop', 'laser', 'assembly', 'electrical_controls', 'enclosures']} 
                    />
                  ))}
                  
                  {/* Project Department Totals Row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px',
                    gap: '1rem',
                    padding: '1rem 0.5rem',
                    marginTop: '0.5rem',
                    borderTop: '2px solid var(--vtr-theme-border)',
                    alignItems: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.25rem'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(7, 1fr)', gap: '1rem' }}>
                      <div style={{ textAlign: 'left', color: 'var(--vtr-theme-text-muted)' }}>TOTALS</div>
                      
                      {['design', 'kitting', 'machine_shop', 'laser', 'assembly', 'electrical_controls', 'enclosures'].map(dept => {
                        const totalOpen = currentProject.department_totals?.[dept]?.total_open || 0;
                        const totalPending = currentProject.department_totals?.[dept]?.total_pending || 0;
                        return (
                          <div key={dept} style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                            {totalOpen > 0 && <span style={{ color: '#ef4444' }}>{totalOpen}</span>}
                            {totalPending > 0 && <span style={{ color: '#eab308' }}>{totalPending}</span>}
                            {totalOpen === 0 && totalPending === 0 && <span style={{ color: '#22c55e' }}>0</span>}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Grand Total */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      {currentProject.defects.total_open > 0 && <span style={{ color: '#ef4444' }}>{currentProject.defects.total_open}</span>}
                      {currentProject.defects.total_pending > 0 && <span style={{ color: '#eab308' }}>{currentProject.defects.total_pending}</span>}
                      {currentProject.defects.total_open === 0 && currentProject.defects.total_pending === 0 && <span style={{ color: '#22c55e' }}>0</span>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '1.5rem', color: 'var(--vtr-theme-text-muted)', textAlign: 'center', marginTop: '4rem' }}>
                No machines found for this project.
              </div>
            )}
          </div>

          {/* Right Side: Milestone Panel */}
          <aside style={{
            flex: '0 0 350px',
            border: '2px solid var(--vtr-theme-border)',
            borderRadius: '12px',
            background: 'var(--vtr-theme-surface, rgba(18, 18, 18, 0.3))',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '2rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
          }}>


            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '1.25rem', textTransform: 'uppercase', color: 'var(--vtr-theme-text-muted)', display: 'block', marginBottom: '0.5rem' }}>Target Ship Date</span>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--vtr-theme-primary)' }}>{targetDate}</div>
            </div>
          </aside>
        </main>
      </div>

      {/* Footer / Progress Bar */}
      <footer style={{ position: 'relative', padding: '1rem 2rem', borderTop: '2px solid var(--vtr-theme-border)', display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--vtr-theme-text-muted)' }}>
          Project {activeIndex + 1} of {projectCount}
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
