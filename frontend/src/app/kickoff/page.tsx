"use client";

import { useEffect, useState, Suspense } from "react";
import { useSSE } from "../../components/SSEProvider";
import { fetchApi } from "../../lib/api";
import styles from "./kickoff.module.css";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAppHotkeys } from "../../hooks/useAppHotkeys";

import { SalesOrder, Machine } from "../../types";
import { SalesOrderModal } from "../../components/SalesOrderModal";
import { SpawnMachineModal } from "../../components/SpawnMachineModal";

function SalesDashboardContent() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [isSalesOrderModalOpen, setIsSalesOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  
  const [spawningOrderContext, setSpawningOrderContext] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsSalesOrderModalOpen(true);
      router.replace("/kickoff");
    }
  }, [searchParams, router]);

  useAppHotkeys('c', (e) => {
    if (!isSalesOrderModalOpen && !spawningOrderContext && !editingOrder) {
      e.preventDefault();
      setIsSalesOrderModalOpen(true);
    }
  }, { enableOnFormTags: false }, [isSalesOrderModalOpen, spawningOrderContext, editingOrder]);

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

  const deleteOrder = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this project? This cannot be undone.")) return;
    await fetchApi(`sales_orders/${id}`, {
      method: "DELETE",
    });
  };

  const deleteMachine = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this part/machine?")) return;
    await fetchApi(`machines/${id}`, {
      method: "DELETE",
    });
  };

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

      <section>
        <h2 style={{ marginBottom: "1.5rem" }}>Active Pipeline</h2>
        <div className={styles.orderList}>
          {orders.map(order => {
            const orderMachines = machines.filter(m => m.sales_order_id === order.id);
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
                        <select className={styles.input} value={editingOrder.status} onChange={e => setEditingOrder({...editingOrder, status: e.target.value as 'open' | 'partially_shipped' | 'fulfilled'})}>
                          <option value="open">Open</option>
                          <option value="partially_shipped">Partially Shipped</option>
                          <option value="fulfilled">Fulfilled</option>
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
              <div key={order.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <h3 className={styles.orderTitle}>{order.customer_name} {order.project_name ? `- ${order.project_name}` : ''} (PO: {order.po_number})</h3>
                    <div className={styles.orderSubtitle}>
                      {order.internal_project_number && <span style={{marginRight: '1rem'}}>Project #: {order.internal_project_number}</span>}
                      {order.responsible_person && <span style={{marginRight: '1rem'}}>PM: {order.responsible_person}</span>}
                      Target Ship: {order.target_ship_date ? new Date(order.target_ship_date).toLocaleDateString() : 'TBD'} | Status: {order.status}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="vtr-btn vtr-btn-secondary" onClick={() => setEditingOrder(order)}>Edit</button>
                    <button className="vtr-btn vtr-btn-secondary" onClick={() => setSpawningOrderContext({ id: order.id, name: order.customer_name })}>+ Spawn</button>
                    <button className="vtr-btn vtr-btn-secondary" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} onClick={() => deleteOrder(order.id)}>🗑️</button>
                  </div>
                </div>

                {orderMachines.length > 0 && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {orderMachines.map(m => (
                      <Link key={m.id} href={`/machine?id=${m.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', paddingRight: '2.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.875rem', position: 'relative' }}>
                          <strong style={{ color: 'var(--vtr-theme-primary)' }}>{m.order_number}</strong>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{m.model_type} • {m.status}</div>
                          <button 
                            onClick={(e) => deleteMachine(e, m.id)}
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1rem' }}
                            title="Delete Part"
                          >
                            🗑️
                          </button>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
