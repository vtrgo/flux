"use client";

import { useEffect, useState, Suspense } from "react";
import { useSSE } from "../../../components/SSEProvider";
import { fetchApi } from "../../../lib/api";
import styles from "./kickoff.module.css";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAppHotkeys } from "../../../hooks/useAppHotkeys";

import { SalesOrder, Machine } from "../../../types";
import { SalesOrderModal } from "../../../components/SalesOrderModal";
import { SpawnMachineModal } from "../../../components/SpawnMachineModal";
import { EditMachineModal } from "../../../components/EditMachineModal";
import { Authorize } from "../../../components/Authorize";
import { calculateDaysLate, calculateProjectDaysLate, formatFatDate } from "../../../lib/dateUtils";

function SalesDashboardContent() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [isSalesOrderModalOpen, setIsSalesOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  
  const [spawningOrderContext, setSpawningOrderContext] = useState<{ id: string, name: string } | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsSalesOrderModalOpen(true);
      router.replace("/kickoff");
    }
  }, [searchParams, router]);

  useAppHotkeys('c', (e) => {
    if (!isSalesOrderModalOpen && !spawningOrderContext && !editingOrder && !editingMachine) {
      e.preventDefault();
      setIsSalesOrderModalOpen(true);
    }
  }, { enableOnFormTags: false }, [isSalesOrderModalOpen, spawningOrderContext, editingOrder, editingMachine]);

  const fetchOrders = async () => {
    try {
      const res = await fetchApi<SalesOrder[]>("sales_orders");
      setOrders(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMachines = async () => {
    try {
      const res = await fetchApi<Machine[]>("machines");
      setMachines(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  useSSE('sales_order_created', fetchOrders);
  useSSE('sales_order_updated', fetchOrders);
  useSSE('sales_order_deleted', fetchOrders);
  useSSE('machine_created', fetchMachines);
  useSSE('machine_updated', fetchMachines);
  useSSE('machine_deleted', fetchMachines);

  useEffect(() => {
    fetchOrders();
    fetchMachines();
  }, []);

  const updateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    await fetchApi(`sales_orders/${editingOrder.id}`, {
      method: "PUT",
      body: JSON.stringify(editingOrder),
    });
    setEditingOrder(null);
    fetchOrders();
  };

  const closeOrder = async (id: string) => {
    if (!window.confirm("Are you sure you want to close and archive this project? It will be moved to the Archived tab and hidden from active shop views.")) return;
    try {
      await fetchApi(`sales_orders/${id}/close`, { method: "POST" });
      fetchOrders();
    } catch (err) {
      console.error("Failed to close project:", err);
    }
  };

  const reopenOrder = async (id: string) => {
    if (!window.confirm("Are you sure you want to reopen this project? It will return to the active pipeline.")) return;
    try {
      await fetchApi(`sales_orders/${id}/reopen`, { method: "POST" });
      fetchOrders();
    } catch (err) {
      console.error("Failed to reopen project:", err);
    }
  };

  const deleteOrder = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this project and all its machines? This cannot be undone.")) return;
    await fetchApi(`sales_orders/${id}`, {
      method: "DELETE",
    });
    fetchOrders();
    fetchMachines();
  };

  const deleteMachine = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this part/machine?")) return;
    await fetchApi(`machines/${id}`, {
      method: "DELETE",
    });
    fetchMachines();
  };

  const activeOrders = orders.filter(o => o.status !== 'closed');
  const archivedOrders = orders.filter(o => o.status === 'closed');
  const displayedOrders = activeTab === 'active' ? activeOrders : archivedOrders;

  return (
    <main className={styles.container}>
      <header className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.title}>Project Kickoff</h1>
        <button className="vtr-btn" onClick={() => setIsSalesOrderModalOpen(true)}>
          Create Project (Press &apos;C&apos;)
        </button>
      </header>

      <SalesOrderModal 
        isOpen={isSalesOrderModalOpen} 
        onClose={() => setIsSalesOrderModalOpen(false)} 
        onSuccess={fetchOrders}
      />
      
      <SpawnMachineModal
        isOpen={!!spawningOrderContext}
        onClose={() => setSpawningOrderContext(null)}
        orderId={spawningOrderContext?.id || ""}
        orderName={spawningOrderContext?.name || ""}
        onSuccess={fetchMachines}
      />

      <EditMachineModal
        isOpen={!!editingMachine}
        onClose={() => setEditingMachine(null)}
        machine={editingMachine}
        onSuccess={fetchMachines}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            background: activeTab === 'active' ? 'var(--vtr-theme-primary)' : 'transparent',
            color: activeTab === 'active' ? '#000' : 'var(--text-secondary)',
            fontWeight: activeTab === 'active' ? 600 : 400,
            border: 'none',
            padding: '0.5rem 1.25rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Active Pipeline ({activeOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          style={{
            background: activeTab === 'archived' ? 'var(--vtr-theme-primary)' : 'transparent',
            color: activeTab === 'archived' ? '#000' : 'var(--text-secondary)',
            fontWeight: activeTab === 'archived' ? 600 : 400,
            border: 'none',
            padding: '0.5rem 1.25rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Archived Projects ({archivedOrders.length})
        </button>
      </div>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>
            {activeTab === 'active' ? 'Active Pipeline' : 'Archived & Closed Projects'}
          </h2>
        </div>

        {displayedOrders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'active' ? 'No active projects in the pipeline.' : 'No archived projects found.'}
          </div>
        ) : (
          <div className={styles.orderList}>
            {displayedOrders.map(order => {
              const orderMachines = machines.filter(m => m.sales_order_id === order.id);
              const projectDaysLate = calculateProjectDaysLate(orderMachines);
              const isEditing = editingOrder?.id === order.id;

              if (isEditing) {
                return (
                  <div key={order.id} className={styles.orderCard}>
                    <form onSubmit={updateOrder}>
                      <div className={styles.formGrid}>
                        <div className={styles.formGroup}><label className={styles.label}>Customer Name</label><input required className={styles.input} value={editingOrder.customer_name} onChange={e => setEditingOrder({...editingOrder, customer_name: e.target.value})} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>PO Number</label><input required className={styles.input} value={editingOrder.po_number} onChange={e => setEditingOrder({...editingOrder, po_number: e.target.value})} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Internal Project #</label><input className={styles.input} value={editingOrder.internal_project_number || ''} onChange={e => setEditingOrder({...editingOrder, internal_project_number: e.target.value})} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Project Name</label><input className={styles.input} value={editingOrder.project_name || ''} onChange={e => setEditingOrder({...editingOrder, project_name: e.target.value})} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>PM</label><input className={styles.input} value={editingOrder.responsible_person || ''} onChange={e => setEditingOrder({...editingOrder, responsible_person: e.target.value})} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>Status</label>
                          <select className={styles.input} value={editingOrder.status} onChange={e => setEditingOrder({...editingOrder, status: e.target.value as SalesOrder['status']})}>
                            <option value="open">Open</option>
                            <option value="partially_shipped">Partially Shipped</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="submit" className="vtr-btn">Save Changes</button>
                        <button type="button" className="vtr-btn vtr-btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button>
                      </div>
                    </form>
                  </div>
                );
              }

              return (
                <div 
                  key={order.id} 
                  className={styles.orderCard}
                  style={order.status === 'closed' ? { opacity: 0.85, borderLeftColor: 'var(--text-secondary)' } : undefined}
                >
                  <div className={styles.orderHeader}>
                    <div>
                      <h3 className={styles.orderTitle}>{order.customer_name} {order.project_name ? `- ${order.project_name}` : ''} (PO: {order.po_number})</h3>
                      <div className={styles.orderSubtitle}>
                        {order.internal_project_number && <span style={{marginRight: '1rem'}}>Project #: {order.internal_project_number}</span>}
                        {order.responsible_person && <span style={{marginRight: '1rem'}}>PM: {order.responsible_person}</span>}
                        Target Ship: {order.target_ship_date ? new Date(order.target_ship_date).toLocaleDateString() : 'TBD'}
                        {' | '}Status: <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{order.status.replace('_', ' ')}</span>
                        {' | '}Days Late: <span style={{ 
                          fontWeight: 700, 
                          color: projectDaysLate > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-primary)' 
                        }}>{projectDaysLate}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* PM and Admin Lifecycle Actions */}
                      <Authorize roles={['admin', 'manager', 'pm', 'sales', 'supervisor']}>
                        {order.status !== 'closed' && (
                          <button 
                            className="vtr-btn vtr-btn-secondary"
                            onClick={() => closeOrder(order.id)}
                            title="Close and archive project"
                          >
                            📁 Close Project
                          </button>
                        )}
                        {order.status === 'closed' && (
                          <button 
                            className="vtr-btn vtr-btn-secondary"
                            style={{ color: 'var(--vtr-theme-primary)', borderColor: 'var(--vtr-theme-primary)' }}
                            onClick={() => reopenOrder(order.id)}
                            title="Reopen archived project"
                          >
                            🔄 Reopen Project
                          </button>
                        )}
                      </Authorize>

                      <button className="vtr-btn vtr-btn-secondary" onClick={() => setEditingOrder(order)}>Edit</button>
                      {order.status !== 'closed' && (
                        <button className="vtr-btn vtr-btn-secondary" onClick={() => setSpawningOrderContext({ id: order.id, name: order.customer_name })}>+ Spawn</button>
                      )}

                      {/* Admin-only Project Delete */}
                      <Authorize roles={['admin', 'manager']}>
                        <button 
                          className="vtr-btn vtr-btn-secondary" 
                          style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} 
                          onClick={() => deleteOrder(order.id)}
                          title="Delete Project (Admin only)"
                        >
                          🗑️
                        </button>
                      </Authorize>
                    </div>
                  </div>

                  {orderMachines.length > 0 && (
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {orderMachines.map(m => {
                        const machineDaysLate = calculateDaysLate(m.fat_date);
                        return (
                          <div 
                            key={m.id} 
                            style={{ 
                              background: 'var(--bg-primary)', 
                              padding: '0.75rem', 
                              paddingRight: '5rem', 
                              borderRadius: '4px', 
                              border: machineDaysLate > 0 ? '1px solid var(--accent-red)' : '1px solid var(--border-color)', 
                              fontSize: '0.875rem', 
                              position: 'relative' 
                            }}
                          >
                            <Link href={`/machine?id=${m.id}`} style={{ textDecoration: 'none' }}>
                              <strong style={{ color: 'var(--vtr-theme-primary)' }}>{m.order_number}</strong>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                {m.model_type} • {m.status}
                              </div>
                              <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>F.A.T.: {formatFatDate(m.fat_date, 'TBD')}</span>
                                <span>•</span>
                                <span style={{ color: machineDaysLate > 0 ? 'var(--accent-red)' : 'var(--vtr-theme-primary)', fontWeight: machineDaysLate > 0 ? 600 : 400 }}>
                                  Days Late: {machineDaysLate}
                                </span>
                              </div>
                            </Link>
                            <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMachine(m);
                                }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem' }}
                                title="Configure / Edit Machine (F.A.T., S/N, Model)"
                              >
                                ✏️
                              </button>
                              {/* Admin-only Machine Delete */}
                              <Authorize roles={['admin', 'manager']}>
                                <button 
                                  onClick={(e) => deleteMachine(e, m.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem' }}
                                  title="Delete Machine (Admin only)"
                                >
                                  🗑️
                                </button>
                              </Authorize>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function SalesDashboard() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading Kickoff Dashboard...</div>}>
      <SalesDashboardContent />
    </Suspense>
  );
}
