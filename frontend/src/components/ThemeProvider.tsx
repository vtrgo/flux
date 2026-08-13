'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'theme-unstyled', name: '⚪ VTR Default (Plain)' },
  { id: 'theme-synthwave', name: '🌆 Synthwave Cyber' },
  { id: 'theme-terminal', name: '💻 Matrix Terminal' },
  { id: 'theme-volcano', name: '🌋 Volcano Coral' }
];

type ThemeContextType = {
  theme: string
  setTheme: (theme: string) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'theme-unstyled',
  setTheme: () => null
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState('theme-unstyled')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('vtr_theme')
    if (stored) {
      setThemeState(stored)
    }
  }, [])

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme)
    localStorage.setItem('vtr_theme', newTheme)
  }

  useEffect(() => {
    if (mounted) {
      // Apply class to body
      document.body.className = `vtr-theme-container ${theme}`
      
      // Dispatch global theme changed event for SVG rendering pipeline if any SVGs listen
      document.dispatchEvent(new CustomEvent('vtr-theme-changed', { detail: { themeId: theme } }));
    }
  }, [theme, mounted])

  // Optional: Prevent hydration mismatch flash by not rendering children until mounted
  // but standard VTR approach is fine if we just apply the class dynamically
  if (!mounted) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
