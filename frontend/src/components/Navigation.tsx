"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const getClassName = (path: string) => {
    return pathname === path ? "vtr-btn vtr-btn-active" : "vtr-btn";
  };

  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <Link href="/design" className={getClassName("/design")}>Design</Link>
      <Link href="/kitting" className={getClassName("/kitting")}>Kitting</Link>
      <Link href="/machine-shop" className={getClassName("/machine-shop")}>Machine Shop</Link>
      <Link href="/laser" className={getClassName("/laser")}>Laser</Link>
      <Link href="/assembly" className={getClassName("/assembly")}>Assembly</Link>
      <Link href="/electrical-controls" className={getClassName("/electrical-controls")}>Electrical / Controls</Link>
      <Link href="/enclosures" className={getClassName("/enclosures")}>Enclosures</Link>
      <Link href="/admin" className={pathname === "/admin" ? "vtr-btn vtr-btn-secondary vtr-btn-active" : "vtr-btn vtr-btn-secondary"}>System Admin</Link>
    </div>
  );
}
