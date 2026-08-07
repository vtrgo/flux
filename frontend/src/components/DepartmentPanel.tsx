import React from 'react';
import styles from '../app/machine/[id]/machine.module.css';

interface DepartmentPanelProps {
  title: string;
  items: any[];
  itemKey: string;
  renderTitle: (item: any) => React.ReactNode;
  renderSubtitle?: (item: any) => React.ReactNode;
  renderStatus: (item: any) => React.ReactNode;
  statusClass: (item: any) => string;
  emptyMessage: string;
  onItemClick?: (item: any) => void;
  actionButton?: React.ReactNode;
}

export function DepartmentPanel({ 
  title, 
  items, 
  itemKey, 
  renderTitle, 
  renderSubtitle, 
  renderStatus, 
  statusClass, 
  emptyMessage,
  onItemClick,
  actionButton
}: DepartmentPanelProps) {
  return (
    <section className={styles.panel}>
      <h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {title}
          <span className={styles.badge}>{items.length} Items</span>
        </div>
        {actionButton}
      </h2>
      <div className={styles.list}>
        {items.length === 0 ? (
          <p style={{ color: 'var(--vtr-theme-neutral, var(--text-secondary))', fontFamily: 'var(--font-mono)' }}>
            {emptyMessage}
          </p>
        ) : (
          items.map(item => (
            <div 
              key={item[itemKey]} 
              className={styles.item} 
              onClick={() => onItemClick && onItemClick(item)}
              style={{ cursor: onItemClick ? 'pointer' : 'default' }}
            >
              <div className={styles.itemDetails}>
                <h3>{renderTitle(item)}</h3>
                {renderSubtitle && <p>{renderSubtitle(item)}</p>}
              </div>
              <div className={`${styles.status} ${styles[statusClass(item)]}`}>
                {renderStatus(item)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
