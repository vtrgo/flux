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
import Link from 'next/link';
import { Logo } from "../components/Logo";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <header style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem 2rem', 
            borderBottom: '1px solid var(--vtr-card-border, var(--border-color))',
            background: 'var(--vtr-card-bg, transparent)'
          }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <Logo width={45} height={45} />
            </Link>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href="/kitting" className="vtr-btn">Kitting</Link>
              <Link href="/assembly" className="vtr-btn">Assembly</Link>
              <Link href="/electrical-controls" className="vtr-btn">Electrical / Controls</Link>
              <Link href="/machine-shop" className="vtr-btn">Machine Shop</Link>
              <Link href="/design" className="vtr-btn">Design</Link>
              <Link href="/admin" className="vtr-btn vtr-btn-secondary">System Admin</Link>
            </div>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
