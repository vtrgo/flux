"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { Machine, MachineAssembly, KittingPart } from '../../types';
import styles from './AssemblyKittingView.module.css';

interface AssemblyKittingViewProps {
  initialMachineId?: string;
}

export function AssemblyKittingView({ initialMachineId }: AssemblyKittingViewProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(initialMachineId || '');
  const [assemblies, setAssemblies] = useState<MachineAssembly[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [updatingPartId, setUpdatingPartId] = useState<string | null>(null);
  const [fulfillingAsmId, setFulfillingAsmId] = useState<string | null>(null);

  // Load active machines if not provided
  useEffect(() => {
    fetchApi<Machine[]>('machines')
      .then(data => {
        const active = (data || []).filter(m => m.status !== 'completed' && m.status !== 'shipped');
        setMachines(active);
        if (!selectedMachineId && active.length > 0) {
          setSelectedMachineId(active[0].id);
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
      // Flatten hierarchy to get all assemblies and their parts
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

  // Pick part handler
  const handlePickPart = useCallback(async (part: KittingPart, delta: number) => {
    const nextPicked = Math.max(0, Math.min(part.qty_required, part.qty_picked + delta));
    if (nextPicked === part.qty_picked) return;

    try {
      setUpdatingPartId(part.id);
      const updated = await fetchApi<KittingPart>(`kitting/parts/${part.id}/pick`, {
        method: 'PUT',
        body: JSON.stringify({ qty_picked: nextPicked }),
      });

      // Optimistically patch assemblies state
      setAssemblies(prev =>
        prev.map(asm => ({
          ...asm,
          parts: (asm.parts || []).map(p => (p.id === part.id ? { ...p, ...updated } : p)),
        }))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update pick quantity';
      toast.error(msg);
    } finally {
      setUpdatingPartId(null);
    }
  }, []);

  // Fulfill tote handler
  const handleFulfillTote = useCallback(async (assemblyId: string) => {
    try {
      setFulfillingAsmId(assemblyId);
      await fetchApi<MachineAssembly>(`assemblies/${assemblyId}/fulfill-tote`, {
        method: 'POST',
      });
      toast.success('Assembly tote marked as kitted & ready for shop floor');
      if (selectedMachineId) {
        await loadAssemblies(selectedMachineId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fulfill tote';
      toast.error(msg);
    } finally {
      setFulfillingAsmId(null);
    }
  }, [selectedMachineId, loadAssemblies]);

  const selectedMachine = useMemo(
    () => machines.find(m => m.id === selectedMachineId),
    [machines, selectedMachineId]
  );

  return (
    <div className={styles.container}>
      <div className={styles.controlsBar}>
        <div className={machineSelectGroupStyles}>
          <label htmlFor="kitting_machine_select" className={styles.label}>
            Target Machine:
          </label>
          <select
            id="kitting_machine_select"
            className={styles.select}
            value={selectedMachineId}
            onChange={e => setSelectedMachineId(e.target.value)}
          >
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                {m.order_number} — {m.model_type}
              </option>
            ))}
          </select>
        </div>
        {selectedMachine && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--vtr-theme-primary)' }}>
            STATUS: {selectedMachine.status.toUpperCase()}
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyNotice}>LOADING ASSEMBLY TOTES...</div>
      ) : assemblies.length === 0 ? (
        <div className={styles.emptyNotice}>
          No assemblies or BOM parts configured for this machine yet. Use the Machine Portal to import or create assemblies.
        </div>
      ) : (
        <div className={styles.toteGrid}>
          {assemblies.map(asm => {
            const parts = asm.parts || [];
            const totalRequired = parts.reduce((s, p) => s + p.qty_required, 0);
            const totalPicked = parts.reduce((s, p) => s + p.qty_picked, 0);
            const percent = totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 100;
            const isAllPicked = parts.length > 0 && totalPicked >= totalRequired;
            const isKitted = asm.status === 'kitted' || asm.status === 'in_assembly' || asm.status === 'assembled' || asm.status === 'qc_verified';

            return (
              <div key={asm.id} className={styles.toteCard} data-testid={`tote-${asm.assembly_code}`}>
                <div className={styles.toteHeader}>
                  <div>
                    <span className={styles.toteCode}>[{asm.assembly_code}]</span>
                    <h3 className={styles.toteName}>{asm.name}</h3>
                    {asm.drawing_number && (
                      <div className={styles.toteMeta}>
                        DWG: {asm.drawing_number} (Rev {asm.revision || 'A'})
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: isKitted ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 202, 40, 0.15)',
                      color: isKitted ? '#00e676' : '#ffca28',
                      border: `1px solid ${isKitted ? '#00e676' : '#ffca28'}`,
                    }}
                  >
                    {asm.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div>
                  <div className={styles.progressBarContainer}>
                    <div
                      className={`${styles.progressBarFill} ${percent === 100 ? styles.progressBarComplete : ''}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className={styles.progressLabel}>
                    <span>Pick Fulfillment</span>
                    <span>
                      {totalPicked} / {totalRequired} parts ({percent}%)
                    </span>
                  </div>
                </div>

                <div className={styles.partsList}>
                  {parts.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
                      No parts assigned to this sub-assembly.
                    </div>
                  ) : (
                    parts.map(part => {
                      const isPartDone = part.qty_picked >= part.qty_required;
                      return (
                        <div
                          key={part.id}
                          className={`${styles.partRow} ${isPartDone ? styles.partRowFulfilled : ''}`}
                        >
                          <div className={styles.partInfo}>
                            <span className={styles.partNumber}>{part.partNumber || part.part_number}</span>
                            {part.description && <span className={styles.partDesc}>{part.description}</span>}
                          </div>

                          <div className={styles.partQtyControls}>
                            <button
                              type="button"
                              className={styles.pickBtn}
                              disabled={part.qty_picked <= 0 || updatingPartId === part.id}
                              onClick={() => handlePickPart(part, -1)}
                              title="Decrease picked quantity"
                            >
                              -1
                            </button>
                            <span
                              className={`${styles.qtyBadge} ${isPartDone ? styles.qtyComplete : ''}`}
                            >
                              {part.qty_picked} / {part.qty_required}
                            </span>
                            <button
                              type="button"
                              className={styles.pickBtn}
                              disabled={isPartDone || updatingPartId === part.id}
                              onClick={() => handlePickPart(part, 1)}
                              title="Pick 1 unit"
                            >
                              +1
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className={styles.toteFooter}>
                  <button
                    type="button"
                    className={styles.fulfillToteBtn}
                    disabled={fulfillingAsmId === asm.id || isKitted}
                    onClick={() => handleFulfillTote(asm.id)}
                  >
                    {isKitted ? '✓ Tote Staged & Kitted' : isAllPicked ? 'Release Tote to Floor' : 'Pick All & Stage Tote'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const machineSelectGroupStyles = styles.machineSelectGroup;
