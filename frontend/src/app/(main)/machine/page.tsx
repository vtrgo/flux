"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSSE } from "../../../components/SSEProvider";
import { fetchApi } from "../../../lib/api";
import Link from "next/link";
import styles from "./machine.module.css";
import { ACTIVE_DEPARTMENTS } from "../../../lib/departments";

import { IssueModal } from "../../../components/IssueModal";
import { IssueCardItem } from "../../../components/IssueCardItem";
import { AttachmentViewer } from "../../../components/AttachmentViewer";

import { Machine, SalesOrder, Defect } from "../../../types";
import { calculateDaysLate, formatFatDate } from "../../../lib/dateUtils";
import { useDateTime } from "../../../contexts/DateTimeContext";

function MachineDetailContent() {
  const router = useRouter();
  const { timezone } = useDateTime();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") as string;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);

  useSSE('defect_added', (newDefect: Defect) => {
    if (newDefect.machine_id === id) {
      setDefects(prev => [...prev, newDefect]);
    }
  });

  useSSE('defect_updated', (updated: Defect) => {
    if (updated.machine_id === id) {
      setDefects(prev => prev.map(d => d.id === updated.id ? { ...updated, order_number: d.order_number } : d));
    }
  });

  useSSE('defect_deleted', (deleted: { id: string }) => {
    setDefects(prev => prev.filter(d => d.id !== deleted.id));
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    if (deleted.id === id) {
      router.push('/');
    }
  });

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [machineData, defects] = await Promise.all([
          fetchApi<Machine>(`machines/${id}`), 
          fetchApi<Defect[]>(`machines/${id}/defects`)
        ]);

        if (machineData) {
          setMachine(machineData);
          if (machineData.sales_order_id) {
            try {
              const order = await fetchApi<SalesOrder>(`sales_orders/${machineData.sales_order_id}`);
              if (order) setSalesOrder(order);
            } catch (err) {
              console.error("Failed to load sales order data", err);
            }
          }
        }

        setDefects(defects || []);
      } catch (err) {
        console.error("Failed to load machine data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const openNewModal = useCallback(() => {
    setEditingDefect(null);
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((defect: Defect) => {
    setEditingDefect(defect);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, defectId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this issue?")) return;
    try {
      await fetchApi(`defects/${defectId}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete defect", err);
    }
  }, []);

  const handleStatusChange = useCallback(async (e: React.MouseEvent, defect: Defect, nextStatus: string) => {
    e.stopPropagation();
    try {
      await fetchApi(`defects/${defect.id}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          status: nextStatus,
          assigned_department: defect.assigned_department
        })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  }, []);

  if (loading) return <div className={styles.loading}>ESTABLISHING CONNECTION...</div>;
  if (!machine) return <div className={styles.loading}>MACHINE NOT FOUND</div>;

  const openDefects = defects.filter(d => d.status === 'open');
  const fixedDefects = defects.filter(d => d.status === 'fixed');
  const verifiedDefects = defects.filter(d => d.status === 'verified');

  const deptOrder = [
    ...ACTIVE_DEPARTMENTS.map(d => ({
      key: d.key,
      label: d.label,
      match: d.key === 'electrical_controls' ? (def: Defect) => def.assigned_department === 'electrical_controls' || def.assigned_department === 'controls' : undefined
    })),
    { key: 'other', label: 'Other', match: (d: Defect) => !ACTIVE_DEPARTMENTS.map(ad => ad.key).concat('controls').includes(d.assigned_department) }
  ];

  const renderGroupedDefects = (defectList: Defect[]) => {
    if (defectList.length === 0) {
      return <p style={{ color: 'var(--vtr-theme-neutral)', fontFamily: 'var(--font-mono)' }}>No issues.</p>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {deptOrder.map(dept => {
          const deptIssues = defectList.filter(d => dept.match ? dept.match(d) : d.assigned_department === dept.key);
          if (deptIssues.length === 0) return null;

          return (
            <div key={dept.key}>
              <h3 style={{ 
                margin: '0 0 1rem 0', 
                fontSize: '0.875rem', 
                color: 'var(--text-secondary)', 
                borderBottom: '1px solid var(--border-color)', 
                paddingBottom: '0.5rem',
                textTransform: 'uppercase',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                {dept.label}
                <span>{deptIssues.length}</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {deptIssues.map(defect => (
                  <IssueCardItem
                    key={defect.id}
                    issue={{ ...defect, order_number: machine.order_number }}
                    onCardClick={openEditModal}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className={styles.title}>{machine.order_number}</h1>
              <div className={styles.subtitle}>{machine.model_type} - Project Portal</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button className="vtr-btn" onClick={openNewModal}>+ ADD ISSUE</button>
              <Link href="/" className="vtr-btn vtr-btn-secondary">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
          
          {salesOrder && (
            <div style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              padding: '1rem',
              display: 'flex',
              gap: '2rem',
              fontFamily: 'var(--font-mono)'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Customer</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.customer_name} {salesOrder.project_name ? `(${salesOrder.project_name})` : ''}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>PO Number</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.po_number}</div>
              </div>
              {salesOrder.internal_project_number && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Internal Project #</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.internal_project_number}</div>
                </div>
              )}
              {salesOrder.responsible_person && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>PM / Responsible</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{salesOrder.responsible_person}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Project Lead</div>
                <div style={{ fontSize: '0.875rem', color: machine.lead ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {machine.lead || 'Unassigned'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Target Ship Date</div>
                <div style={{ fontSize: '0.875rem', color: salesOrder.target_ship_date ? 'var(--vtr-theme-primary)' : 'var(--text-secondary)' }}>
                  {salesOrder.target_ship_date ? formatFatDate(salesOrder.target_ship_date, 'TBD', timezone) : 'TBD'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>F.A.T. Date</div>
                <div style={{ fontSize: '0.875rem', color: machine.fat_date ? 'var(--vtr-theme-primary)' : 'var(--text-secondary)' }}>
                  {formatFatDate(machine.fat_date, 'TBD', timezone)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Days Late</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: calculateDaysLate(machine.fat_date, timezone) > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-primary)' }}>
                  {calculateDaysLate(machine.fat_date, timezone)}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', width: '100%' }}>
        {/* OPEN COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Open Issues <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{openDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(openDefects)}
          </div>
        </section>

        {/* FIXED COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Fixed (Pending Verification) <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{fixedDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(fixedDefects)}
          </div>
        </section>

        {/* VERIFIED COLUMN */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--vtr-theme-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Verified & Cleared <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{verifiedDefects.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderGroupedDefects(verifiedDefects)}
          </div>
        </section>
      </div>

      <IssueModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingDefect={editingDefect} 
        defaultAssignedDept="quality"
        preselectedMachineId={machine.id}
      />
    </main>
  );
}

export default function MachineDetail() {
  return (
    <Suspense fallback={<div>Loading machine...</div>}>
      <MachineDetailContent />
    </Suspense>
  );
}
