"use client";

import React, { useRef } from 'react';
import styles from './FilterButtonGroup.module.css';

interface FilterButtonGroupProps {
  options: string[];
  activeOption: string;
  onChange: (option: string) => void;
  label?: string;
}

export const FilterButtonGroup: React.FC<FilterButtonGroupProps> = ({ options, activeOption, onChange, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleOption = (option: string) => {
    onChange(option);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, option: string) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleOption(option);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % options.length;
      const buttons = containerRef.current?.querySelectorAll('button');
      buttons?.[nextIndex]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + options.length) % options.length;
      const buttons = containerRef.current?.querySelectorAll('button');
      buttons?.[prevIndex]?.focus();
    }
  };

  return (
    <div className={styles.container} role="radiogroup" aria-label={label} ref={containerRef}>
      {label && <span className={styles.label}>{label}:</span>}
      <div className={styles.group}>
        {options.map((option, index) => {
          const isActive = activeOption === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              className={`${styles.button} ${isActive ? styles.active : ''}`}
              onClick={() => toggleOption(option)}
              onKeyDown={(e) => handleKeyDown(e, index, option)}
              aria-checked={isActive}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
};
