import React from 'react';
import Link from 'next/link';
import { Machine, DefectSummary } from '../types';
import { ACTIVE_DEPARTMENTS } from '../lib/departments';

interface MachineCardProps {
  machine: Machine;
  defectSummaries: DefectSummary[];
  onDelete: (e: React.MouseEvent, id: string) => void;
  onSelectDept: (machineId: string, dept: string) => void;
}

const MachineCard = React.memo(({ machine, defectSummaries, onDelete, onSelectDept }: MachineCardProps) => {
  const machineSummaries = defectSummaries.filter(s => s.machine_id === machine.id);
  
  // Aggregate using the natively provided totals from the backend payload
  const totalOpen = machineSummaries.reduce((sum, s) => sum + (s.total_open || 0), 0);
  const totalPending = machineSummaries.reduce((sum, s) => sum + (s.total_pending || 0), 0);
  const totalClosed = machineSummaries.reduce((sum, s) => sum + (s.closed || 0), 0);

  return (
    <Link href={`/machine?id=${machine.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div 
        style={{ 
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '1.5rem',
          background: 'rgba(0,0,0,0.1)',
          position: 'relative',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.borderColor = 'var(--vtr-theme-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
          e.currentTarget.style.borderColor = 'var(--border-color)';
        }}
      >
        <button 
          onClick={(e) => onDelete(e, machine.id)}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: '1px solid var(--accent-red)',
            color: 'var(--accent-red)',
            borderRadius: '4px',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            zIndex: 10
          }}
          title="Delete Machine"
        >
          🗑️
        </button>
        
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{machine.order_number}</h3>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{machine.model_type}</div>
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <span style={{ color: totalOpen > 0 ? 'var(--accent-red)' : 'inherit' }}>Open: {totalOpen}</span>
          <span style={{ color: totalPending > 0 ? 'var(--accent-amber)' : 'inherit' }}>Pending: {totalPending}</span>
          <span>&rarr;</span>
          <span style={{ color: totalClosed > 0 ? 'var(--vtr-theme-primary)' : 'inherit' }}>Closed: {totalClosed}</span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {ACTIVE_DEPARTMENTS.map(dept => {
            const summary = machineSummaries.find(s => 
              s.assigned_department === dept.key || (dept.key === 'electrical_controls' && s.assigned_department === 'controls')
            );
            
            const openCritical = summary?.open_critical || 0;
            const openModerate = summary?.open_moderate || 0;
            const openMinor = summary?.open_minor || 0;
            
            const pendingCritical = summary?.pending_critical || 0;
            const pendingModerate = summary?.pending_moderate || 0;
            const pendingMinor = summary?.pending_minor || 0;
            
            const closed = summary?.closed || 0;
            const totalOpenAndPending = (summary?.total_open || 0) + (summary?.total_pending || 0);
            
            let borderColor = 'var(--border-color)';
            if (openCritical > 0 || pendingCritical > 0) {
              borderColor = 'var(--accent-red)';
            } else if (openModerate > 0 || pendingModerate > 0) {
              borderColor = 'var(--accent-amber)';
            } else if (openMinor > 0 || pendingMinor > 0) {
              borderColor = 'var(--vtr-theme-primary)';
            }

            return (
              <div key={dept.key} 
                style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: `1px solid ${borderColor}`,
                  padding: '0.75rem', 
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectDept(machine.id, dept.key);
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              >
                <div style={{ color: 'var(--vtr-theme-primary)', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                  {dept.label} {totalOpenAndPending > 0 && `(${totalOpenAndPending} Issues)`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {totalOpenAndPending === 0 ? (
                    <div style={{ color: 'var(--vtr-theme-neutral)', fontStyle: 'italic', padding: '0.25rem 0' }}>✓ No active issues</div>
                  ) : (
                    <>
                      {(openCritical > 0 || pendingCritical > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
                          <span>Critical:</span> 
                          <span>{openCritical > 0 ? `${openCritical} Open` : ''}{openCritical > 0 && pendingCritical > 0 ? ' | ' : ''}{pendingCritical > 0 ? `${pendingCritical} Pending` : ''}</span>
                        </div>
                      )}
                      {(openModerate > 0 || pendingModerate > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-amber)' }}>
                          <span>Moderate:</span> 
                          <span>{openModerate > 0 ? `${openModerate} Open` : ''}{openModerate > 0 && pendingModerate > 0 ? ' | ' : ''}{pendingModerate > 0 ? `${pendingModerate} Pending` : ''}</span>
                        </div>
                      )}
                      {(openMinor > 0 || pendingMinor > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--vtr-theme-primary)' }}>
                          <span>Minor:</span> 
                          <span>{openMinor > 0 ? `${openMinor} Open` : ''}{openMinor > 0 && pendingMinor > 0 ? ' | ' : ''}{pendingMinor > 0 ? `${pendingMinor} Pending` : ''}</span>
                        </div>
                      )}
                    </>
                  )}
                  {closed > 0 && (
                    <>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.25rem 0' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--vtr-theme-neutral)' }}>
                        <span>Closed:</span> <span>{closed}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
});

MachineCard.displayName = "MachineCard";

export { MachineCard };
