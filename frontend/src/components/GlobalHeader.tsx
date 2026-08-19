"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from "./Logo";
import { Navigation } from "./Navigation";

export function GlobalHeader() {
  const pathname = usePathname();

  return (
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
      {pathname !== '/display' && <Navigation />}
    </header>
  );
}
