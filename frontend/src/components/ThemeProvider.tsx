'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'theme-unstyled', name: '⚪ VTR Default (Plain)' },
  { id: 'theme-vtr-brand', name: '⚡ VTR Signature' },
  { id: 'theme-impossible-triangle', name: '📐 Impossible Triangle' },
  { id: 'theme-cosmic-nebula', name: '🌌 Cosmic Nebula' },
  { id: 'theme-synthwave', name: '🌆 Synthwave Cyber' },
  { id: 'theme-volcano', name: '🌋 Volcano Gold' },
  { id: 'theme-galaxy', name: '✨ Galaxy Silver' },
  { id: 'theme-terminal', name: '💻 Matrix Terminal' },
  { id: 'theme-vaporwave', name: '🍧 Vaporwave Pastel' },
  { id: 'theme-lightning', name: '⚡ High Voltage' },
  { id: 'theme-hologram', name: '🥽 3D Hologram' },
  { id: 'theme-ice', name: '🧊 Cryo Precision' },
  { id: 'theme-industrial', name: '⚙️ Machined Titanium' },
  { id: 'theme-broadcast', name: '📡 Broadcast Stream' },
  { id: 'theme-celestial-harmony', name: '🌀 Celestial Swirl' },
  { id: 'theme-quantum-flux', name: '⚛️ Quantum Flux' },
  { id: 'theme-entropic-glitch', name: '👾 Cyber Anomaly' },
  { id: 'theme-cosmic-singularity', name: '🕳️ Singularity Warp' },
  { id: 'theme-holographic-echo', name: '💎 Holographic Echo' },
  { id: 'theme-quantum-drop', name: '💧 The Quantum Drop' }
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
