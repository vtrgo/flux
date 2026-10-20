'use client';

import React, { useState, useId } from 'react';
import styles from './CoNCWidget.module.css';
import { useCoNCData } from '../hooks/useCoNCData';

interface CoNCWidgetProps {
  salesOrderId?: string;
  defaultHourlyRate?: number;
}

export const CoNCWidget: React.FC<CoNCWidgetProps> = React.memo(function CoNCWidget({
  salesOrderId,
  defaultHourlyRate = 85.00,
}) {
  const [hourlyRate, setHourlyRate] = useState<number>(defaultHourlyRate);
  const [activeTab, setActiveTab] = useState<'department' | 'machine'>('department');
  const hourlyRateInputId = useId();

  const { summary, loading } = useCoNCData({
    salesOrderId,
    hourlyRate,
  });

  const getPillClass = (pct: number) => {
    if (pct >= 15) return styles.concHigh;
    if (pct >= 5) return styles.concMedium;
    return styles.concLow;
  };

  const formatCurrency = (val: number | undefined) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const formatHours = (val: number | undefined) => {
    return `${(val || 0).toFixed(1)}h`;
  };

  return (
    <div className={styles.container} data-testid="conc-widget">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h3 className={styles.title}>
            <span>Cost of Non-Conformance (CoNC)</span>
          </h3>
        </div>

        <div className={styles.rateControl}>
          <label htmlFor={hourlyRateInputId}>BURDEN RATE ($/HR):</label>
          <input
            id={hourlyRateInputId}
            type="number"
            className={styles.rateInput}
            value={hourlyRate}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0) {
                setHourlyRate(val);
              }
            }}
            min="0"
            step="5"
            data-testid="hourly-rate-input"
          />
        </div>
      </div>

      <div className={styles.cardsGrid}>
        <div className={`${styles.metricCard} ${styles.metricCardFeatured}`}>
          <span className={styles.cardLabel}>Total CoNC Cost</span>
          <span className={`${styles.cardValue} ${styles.cardValueCost}`} data-testid="total-conc-cost">
            {formatCurrency(summary?.total_conc_cost)}
          </span>
          <span className={styles.cardSubtext}>
            Burden rate: ${summary?.hourly_rate ?? hourlyRate}/hr
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.cardLabel}>Non-Conformance Labor</span>
          <span className={styles.cardValue} data-testid="total-conc-hours">
            {formatHours(summary?.total_conc_hours)}
          </span>
          <span className={styles.cardSubtext}>
            Rework + Defect Resolution
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.cardLabel}>CoNC % of Labor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
            <span className={styles.cardValue} data-testid="conc-percentage">
              {(summary?.conc_percentage_of_labor || 0).toFixed(1)}%
            </span>
            <span className={`${styles.concPill} ${getPillClass(summary?.conc_percentage_of_labor || 0)}`}>
              {(summary?.conc_percentage_of_labor || 0) < 5 ? 'OPTIMAL' : (summary?.conc_percentage_of_labor || 0) < 15 ? 'MODERATE' : 'CRITICAL'}
            </span>
          </div>
          <span className={styles.cardSubtext}>
            Of total shop floor hours
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.cardLabel}>Rework Labor Cost</span>
          <span className={styles.cardValue} data-testid="rework-cost">
            {formatCurrency(summary?.rework_cost)}
          </span>
          <span className={styles.cardSubtext}>
            {formatHours(summary?.total_rework_hours)} actual rework
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.cardLabel}>Defect Fix Cost</span>
          <span className={styles.cardValue} data-testid="defect-cost">
            {formatCurrency(summary?.defect_cost)}
          </span>
          <span className={styles.cardSubtext}>
            {formatHours(summary?.total_defect_hours)} defect resolution
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.cardLabel}>NCR Impact</span>
          <span className={styles.cardValue} data-testid="ncr-cost">
            {formatCurrency(summary?.ncr_cost)}
          </span>
          <span className={styles.cardSubtext}>
            {formatHours(summary?.total_ncr_hours)} formal non-conformances
          </span>
        </div>
      </div>

      <div className={styles.breakdownTabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'department' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('department')}
          data-testid="tab-department"
        >
          By Department ({summary?.department_breakdown?.length || 0})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'machine' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('machine')}
          data-testid="tab-machine"
        >
          By Machine / Project ({summary?.machine_breakdown?.length || 0})
        </button>
      </div>

      {loading && !summary ? (
        <div className={styles.emptyState}>Calculating Cost of Non-Conformance metrics...</div>
      ) : activeTab === 'department' ? (
        <div className={styles.tableWrapper}>
          <table className={styles.concTable} data-testid="department-table">
            <thead>
              <tr>
                <th>Department</th>
                <th className={styles.numCol}>Prod Hours</th>
                <th className={styles.numCol}>Rework Hours</th>
                <th className={styles.numCol}>Defect Hours</th>
                <th className={styles.numCol}>CoNC Hours</th>
                <th className={styles.numCol}>CoNC Cost</th>
                <th className={styles.numCol}>CoNC %</th>
              </tr>
            </thead>
            <tbody>
              {summary?.department_breakdown && summary.department_breakdown.length > 0 ? (
                summary.department_breakdown.map((dept) => (
                  <tr key={dept.department}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{dept.department}</td>
                    <td className={styles.numCol}>{dept.production_hours.toFixed(1)}</td>
                    <td className={styles.numCol}>{dept.rework_hours.toFixed(1)}</td>
                    <td className={styles.numCol}>{dept.defect_hours.toFixed(1)}</td>
                    <td className={styles.numCol} style={{ fontWeight: 700 }}>{dept.conc_hours.toFixed(1)}</td>
                    <td className={styles.numCol} style={{ color: '#ff7043', fontWeight: 700 }}>
                      {formatCurrency(dept.conc_cost)}
                    </td>
                    <td className={styles.numCol}>
                      <span className={`${styles.concPill} ${getPillClass(dept.conc_percentage)}`}>
                        {dept.conc_percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    No department labor data recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.concTable} data-testid="machine-table">
            <thead>
              <tr>
                <th>Machine / Order</th>
                <th>Customer</th>
                <th className={styles.numCol}>Total Hours</th>
                <th className={styles.numCol}>Rework Hours</th>
                <th className={styles.numCol}>Defect Hours</th>
                <th className={styles.numCol}>CoNC Hours</th>
                <th className={styles.numCol}>CoNC Cost</th>
                <th className={styles.numCol}>CoNC %</th>
              </tr>
            </thead>
            <tbody>
              {summary?.machine_breakdown && summary.machine_breakdown.length > 0 ? (
                summary.machine_breakdown.map((m) => (
                  <tr key={m.machine_id}>
                    <td>
                      <strong>{m.order_number || 'General'}</strong>
                      {m.model_type && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>({m.model_type})</span>}
                    </td>
                    <td>{m.customer_name || 'Internal'}</td>
                    <td className={styles.numCol}>{m.total_hours.toFixed(1)}</td>
                    <td className={styles.numCol}>{m.rework_hours.toFixed(1)}</td>
                    <td className={styles.numCol}>{m.defect_hours.toFixed(1)}</td>
                    <td className={styles.numCol} style={{ fontWeight: 700 }}>{m.conc_hours.toFixed(1)}</td>
                    <td className={styles.numCol} style={{ color: '#ff7043', fontWeight: 700 }}>
                      {formatCurrency(m.conc_cost)}
                    </td>
                    <td className={styles.numCol}>
                      <span className={`${styles.concPill} ${getPillClass(m.conc_percentage)}`}>
                        {m.conc_percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
                    No machine labor data recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
