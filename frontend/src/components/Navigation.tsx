"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navigation.module.css';

const DEPARTMENTS = [
  { path: "/design", label: "Design" },
  { path: "/kitting", label: "Kitting" },
  { path: "/machine-shop", label: "Machine Shop" },
  { path: "/laser", label: "Laser" },
  { path: "/assembly", label: "Assembly" },
  { path: "/electrical-controls", label: "Electrical / Controls" },
  { path: "/enclosures", label: "Enclosures" },
];

export function Navigation() {
  const pathname = usePathname();

  const getClassName = (path: string) => {
    return pathname === path ? "vtr-btn vtr-btn-active" : "vtr-btn";
  };

  const isDepartmentActive = DEPARTMENTS.some(dept => pathname === dept.path);

  return (
    <div className={styles.navContainer}>
      <Link href="/" className={getClassName("/")}>Dashboard</Link>
      <Link href="/quality" className={getClassName("/quality")}>Quality Hub</Link>

      <div className={styles.dropdownContainer}>
        <button className={isDepartmentActive ? "vtr-btn vtr-btn-active" : "vtr-btn"} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Departments <span style={{ fontSize: '0.7em' }}>▼</span>
        </button>
        
        <div className={styles.dropdownMenu}>
          {DEPARTMENTS.map((dept) => (
            <Link 
              key={dept.path} 
              href={dept.path} 
              className={`${styles.dropdownItem} ${pathname === dept.path ? styles.dropdownItemActive : ''}`}
            >
              {dept.label}
            </Link>
          ))}
        </div>
      </div>

      <Link href="/admin" className={pathname === "/admin" ? "vtr-btn vtr-btn-secondary vtr-btn-active" : "vtr-btn vtr-btn-secondary"}>
        System Admin
      </Link>
    </div>
  );
}
