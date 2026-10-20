"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
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
  const { isAdmin, user } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getClassName = (path: string) => {
    return pathname === path ? "vtr-btn vtr-btn-active" : "vtr-btn";
  };

  const isDepartmentActive = DEPARTMENTS.some(dept => pathname === dept.path);

  useEffect(() => {
    // Close dropdown on outside click
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [pathname]);

  return (
    <div className={styles.navContainer}>
      <Link href="/" className={getClassName("/")}>Dashboard</Link>
      <Link 
        href="/quality" 
        className={getClassName("/quality")}
      >
        Quality / PM Hub
      </Link>
      <Link 
        href="/ncrs" 
        className={getClassName("/ncrs")}
      >
        NCR Tracker
      </Link>
      <Link 
        href="/rework" 
        className={getClassName("/rework")}
      >
        Rework Tracker
      </Link>
      <Link 
        href="/timesheet" 
        className={getClassName("/timesheet")}
      >
        Timesheet
      </Link>

      <div className={styles.dropdownContainer} ref={dropdownRef}>
        <button 
          type="button"
          className={isDepartmentActive ? "vtr-btn vtr-btn-active" : "vtr-btn"} 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          onClick={() => setIsDropdownOpen(prev => !prev)}
          aria-haspopup="true"
          aria-expanded={isDropdownOpen}
        >
          Departments <span style={{ fontSize: '0.7em' }}>{isDropdownOpen ? '▲' : '▼'}</span>
        </button>
        
        <div className={`${styles.dropdownMenu} ${isDropdownOpen ? styles.dropdownMenuOpen : ''}`}>
          {DEPARTMENTS.map((dept) => {
            let isHome = false;
            if (user?.department) {
              const pathKey = dept.path.substring(1);
              if (
                pathKey === user.department || 
                pathKey.replace('-', '_') === user.department ||
                (pathKey === 'electrical-controls' && user.department === 'controls')
              ) {
                isHome = true;
              }
            }
            return (
              <Link 
                key={dept.path} 
                href={dept.path} 
                className={`${styles.dropdownItem} ${pathname === dept.path ? styles.dropdownItemActive : ''}`}
                onClick={() => setIsDropdownOpen(false)}
              >
                {dept.label} {isHome && <span title="Your Home Department">🏠</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <Link href="/admin" className={pathname === "/admin" ? "vtr-btn vtr-btn-secondary vtr-btn-active" : "vtr-btn vtr-btn-secondary"}>
          System Admin
        </Link>
      )}
    </div>
  );
}
