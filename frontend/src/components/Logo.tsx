'use client'

import React from 'react'

export const Logo = ({ className = '', width = 45, height = 45 }: { className?: string, width?: number, height?: number }) => {
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
      </div>
    </div>
  )
}
