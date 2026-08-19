import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-mono' });

export const metadata: Metadata = {
  title: "vtrFlux - Manufacturing Execution System",
  description: "Digital Birth Certificate and Relational Machine Tracking",
};

import { ThemeProvider } from "../components/ThemeProvider";
import { SSEProvider } from "../components/SSEProvider";
import Link from 'next/link';
import { Logo } from "../components/Logo";
import { Navigation } from "../components/Navigation";
import { CommandPalette } from "../components/CommandPalette";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <SSEProvider>
            <header style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1rem 2rem', 
              borderBottom: '1px solid var(--vtr-card-border, var(--border-color))',
              background: 'var(--bg-primary, rgba(18, 18, 18, 0.85))',
              backdropFilter: 'blur(8px)',
              position: 'sticky',
              top: 0,
              zIndex: 50
            }}>
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <Logo width={45} height={45} />
              </Link>
              <Navigation />
            </header>
            <div id="vtr-global-focus-sink" tabIndex={-1} style={{ outline: 'none' }}></div>
            {children}
            <CommandPalette />
          </SSEProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
