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
      // Cleanly update theme classes on body without stripping Next.js font variable classes
      THEMES.forEach(t => document.body.classList.remove(t.id));
      document.body.classList.add('vtr-theme-container', theme);
      document.body.dataset.theme = theme;
      document.documentElement.dataset.theme = theme;
      
      // Dispatch global theme changed event for SVG rendering pipeline if any SVGs listen
      document.dispatchEvent(new CustomEvent('vtr-theme-changed', { detail: { themeId: theme } }));
    }
  }, [theme, mounted])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
