"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { useMachineFATReadiness } from '../../hooks/useMachineFATReadiness';
import { Machine, MachineAssembly, AssemblyStatus } from '../../types';
import styles from './AssemblyShopHubView.module.css';

interface AssemblyShopHubViewProps {
  initialMachineId?: string;
}

export function AssemblyShopHubView({ initialMachineId }: AssemblyShopHubViewProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(initialMachineId || '');
  const [assemblies, setAssemblies] = useState<MachineAssembly[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [updatingAsmId, setUpdatingAsmId] = useState<string | null>(null);

  const { readiness, loading: readinessLoading, refetch: refetchReadiness } = useMachineFATReadiness(selectedMachineId);

  // Load machines
  useEffect(() => {
    fetchApi<Machine[]>('machines')
      .then(data => {
        const active = (data || []).filter(m => m.status !== 'completed' && m.status !== 'shipped');
        setMachines(active);
        if (!selectedMachineId && active.length > 0) {
          // Prefer machine in assembly status if present
          const inAssembly = active.find(m => m.status === 'assembly');
          setSelectedMachineId(inAssembly ? inAssembly.id : active[0].id);
        }
      })
      .catch(err => {
        console.error('Failed to load machines', err);
      });
  }, [selectedMachineId]);

  // Load assemblies for selected machine
  const loadAssemblies = useCallback(async (machineId: string) => {
    if (!machineId) {
      setAssemblies([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApi<MachineAssembly[]>(`machines/${machineId}/assemblies`);
      // Flatten hierarchy
      const flattenTree = (nodes: MachineAssembly[]): MachineAssembly[] => {
        let result: MachineAssembly[] = [];
        for (const n of nodes) {
          result.push(n);
          if (n.sub_assemblies && n.sub_assemblies.length > 0) {
            result = result.concat(flattenTree(n.sub_assemblies));
          }
        }
        return result;
      };
      setAssemblies(flattenTree(data || []));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load assemblies';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMachineId) {
      loadAssemblies(selectedMachineId);
    }
  }, [selectedMachineId, loadAssemblies]);

  // Status change handler
  const handleStatusChange = useCallback(async (assemblyId: string, nextStatus: AssemblyStatus) => {
    try {
      setUpdatingAsmId(assemblyId);
      await fetchApi<MachineAssembly>(`assemblies/${assemblyId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Assembly status updated to ${nextStatus.replace(/_/g, ' ')}`);

      setAssemblies(prev =>
        prev.map(a => (a.id === assemblyId ? { ...a, status: nextStatus } : a))
      );
      refetchReadiness();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update assembly status';
      toast.error(msg);
    } finally {
      setUpdatingAsmId(null);
    }
  }, [refetchReadiness]);

  const selectedMachine = useMemo(
    () => machines.find(m => m.id === selectedMachineId),
    [machines, selectedMachineId]
  );

  // Compute metrics
  const metrics = useMemo(() => {
    const total = assemblies.length;
    const completed = assemblies.filter(a => a.status === 'assembled' || a.status === 'qc_verified').length;
    const inAssembly = assemblies.filter(a => a.status === 'in_assembly').length;
    const kitted = assemblies.filter(a => a.status === 'kitted').length;
    const totalQuoted = assemblies.reduce((s, a) => s + (a.quoted_hours || 0), 0);
    const totalActual = assemblies.reduce((s, a) => s + (a.actual_hours || 0), 0);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inAssembly, kitted, totalQuoted, totalActual, percent };
  }, [assemblies]);

  return (
    <div className={styles.container}>
      <div className={styles.controlsBar}>
        <div className={machineSelectGroupStyles}>
          <label htmlFor="assembly_machine_select" className={styles.label}>
            Active Machine:
          </label>
          <select
            id="assembly_machine_select"
            className={styles.select}
            value={selectedMachineId}
            onChange={e => setSelectedMachineId(e.target.value)}
          >
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                {m.order_number} — {m.model_type} ({m.status})
              </option>
            ))}
          </select>
        </div>
        {selectedMachine && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            LEAD: <span style={{ color: 'var(--text-primary)' }}>{selectedMachine.lead || 'Unassigned'}</span>
          </div>
        )}
      </div>

      {/* FAT Readiness Banner */}
      {!readinessLoading && readiness && (
        readiness.can_proceed ? (
          <div className={styles.fatBannerReady} data-testid="fat-ready-banner">
            <span>🛡️</span>
            <span><strong>FAT READY:</strong> All mechanical assemblies, quality defects, and rework items cleared.</span>
          </div>
        ) : (
          <div className={styles.fatBannerBlocked} data-testid="fat-blocked-banner">
            <div className={styles.fatBlockedTitle}>
              <span>⚠️</span>
              <span>F.A.T. Gating Alert ({readiness.blockers.length} Active Blocker{readiness.blockers.length === 1 ? '' : 's'})</span>
            </div>
            <ul className={styles.fatBlockersList}>
              {readiness.blockers.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* Build Summary Metrics */}
      <div className={styles.metricsRow}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Assembly Progress</span>
          <span className={styles.metricValue}>
            {metrics.completed} / {metrics.total} ({metrics.percent}%)
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>In Active Assembly</span>
          <span className={styles.metricValue} style={{ color: '#00e5ff' }}>
            {metrics.inAssembly}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Staged & Kitted</span>
          <span className={styles.metricValue} style={{ color: '#ffca28' }}>
            {metrics.kitted}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Labor Quoted vs Actual</span>
          <span className={styles.metricValue}>
            {metrics.totalActual.toFixed(1)} / {metrics.totalQuoted.toFixed(1)}h
          </span>
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyNotice}>LOADING MACHINE ASSEMBLIES...</div>
      ) : assemblies.length === 0 ? (
        <div className={styles.emptyNotice}>
          No assemblies configured for this machine yet. Use the Machine Portal to import or create assemblies.
        </div>
      ) : (
        <div className={styles.assemblyTableCard}>
          <table className={styles.assemblyTable}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Code</th>
                <th>Assembly Name & Description</th>
                <th style={{ width: '180px' }}>Drawing / Rev</th>
                <th style={{ width: '130px' }}>Labor Logged</th>
                <th style={{ width: '190px' }}>Assembly Status</th>
              </tr>
            </thead>
            <tbody>
              {assemblies.map(asm => (
                <tr key={asm.id} data-testid={`assembly-row-${asm.assembly_code}`}>
                  <td className={styles.codeCell}>{asm.assembly_code}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{asm.name}</div>
                    {asm.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {asm.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {asm.drawing_number ? (
                      <span className={styles.dwgBadge}>
                        {asm.drawing_number} (Rev {asm.revision || 'A'})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No Drawing</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {(asm.actual_hours || 0).toFixed(1)} / {(asm.quoted_hours || 0).toFixed(1)}h
                    </span>
                  </td>
                  <td>
                    <select
                      aria-label={`Status for ${asm.assembly_code}`}
                      className={styles.statusSelect}
                      disabled={updatingAsmId === asm.id}
                      value={asm.status}
                      onChange={e => handleStatusChange(asm.id, e.target.value as AssemblyStatus)}
                    >
                      <option value="design_draft">Design Draft</option>
                      <option value="ready_for_kitting">Ready For Kitting</option>
                      <option value="kitting_in_progress">Kitting In Progress</option>
                      <option value="kitted">Kitted (Ready For Shop)</option>
                      <option value="in_assembly">In Assembly</option>
                      <option value="assembled">Assembled</option>
                      <option value="qc_verified">QC Verified</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const machineSelectGroupStyles = styles.machineSelectGroup;
