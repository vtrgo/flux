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
  const [theme, setTheme] = useState('theme-unstyled')

  useEffect(() => {
    // Apply class to body
    document.body.className = `vtr-theme-container ${theme}`
    
    // Dispatch global theme changed event for SVG rendering pipeline if any SVGs listen
    document.dispatchEvent(new CustomEvent('vtr-theme-changed', { detail: { themeId: theme } }));
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
