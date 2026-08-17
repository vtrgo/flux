'use client'

import React from 'react'
import { useSSEConnectionStatus } from './SSEProvider'

export const Logo = ({ className = '', width = 45, height = 45 }: { className?: string, width?: number, height?: number }) => {
  const sseConnected = useSSEConnectionStatus()
  
  return (
    <div className={`vtr-logo-container ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
      <img 
        src="/assets/Triangle Icon_Solid.png" 
        alt="VTR Monogram" 
        width={width} 
        height={height} 
        style={{ objectFit: 'contain' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ 
          fontFamily: 'var(--font-inter), sans-serif', 
          fontSize: '28px', 
          fontWeight: 700, 
          letterSpacing: '-0.02em',
          color: 'var(--vtr-theme-primary, var(--text-primary))',
          display: 'flex',
          alignItems: 'baseline',
          lineHeight: '1.1'
        }}>
          <span style={{ fontWeight: 900 }}>vtr</span>
          <span style={{ fontWeight: 300, color: 'var(--text-primary)' }}>Flux</span>
        </span>
        <span style={{ 
          fontFamily: 'var(--font-mono), monospace', 
          fontSize: '0.55rem', 
          fontWeight: 600, 
          letterSpacing: '0.1em', 
          color: 'var(--vtr-theme-neutral, var(--text-secondary))',
          textTransform: 'uppercase'
        }}>
          Manufacturing Execution System
        </span>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '4px',
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '0.45rem',
          color: sseConnected ? 'var(--vtr-theme-primary, var(--accent-green, #00ff00))' : 'var(--vtr-theme-accent, var(--accent-amber, #ffb000))',
          letterSpacing: '0.1em',
          fontWeight: 600
        }}>
          <span style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: sseConnected ? 'var(--vtr-theme-primary, var(--accent-green, #00ff00))' : 'var(--vtr-theme-accent, var(--accent-amber, #ffb000))',
            boxShadow: '0 0 4px currentColor',
            animation: sseConnected ? 'pulse 2s infinite' : 'none'
          }}></span>
          {sseConnected ? "SYSTEM ONLINE" : "CONNECTING..."}
        </div>
      </div>
    </div>
  )
}
