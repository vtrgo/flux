import React from 'react';

interface HeaderMetricProps {
  title: string;
  value: number;
  color: string;
}

export function HeaderMetric({ title, value, color }: HeaderMetricProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: '1rem', textTransform: 'uppercase', color: 'var(--vtr-theme-text-muted)' }}>{title}</span>
      <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: color, lineHeight: 1, marginTop: '0.25rem' }}>{value}</span>
    </div>
  );
}
