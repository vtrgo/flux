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
              background: 'var(--vtr-card-bg, transparent)'
            }}>
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <Logo width={45} height={45} />
              </Link>
              <Navigation />
            </header>
            {children}
          </SSEProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
