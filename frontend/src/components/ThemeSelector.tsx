'use client'

import React from 'react'
import { useTheme, THEMES } from './ThemeProvider'

export const ThemeSelector = () => {
  const { theme, setTheme } = useTheme()

  return (
    <div style={{ padding: '10px', display: 'flex', alignItems: 'center', zIndex: 1000, position: 'relative' }}>
      <label htmlFor="theme-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>Theme:</label>
      <select 
        id="theme-select" 
        value={theme} 
        onChange={(e) => setTheme(e.target.value)}
        className="vtr-input"
        style={{ width: 'auto', cursor: 'pointer' }}
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  )
}
