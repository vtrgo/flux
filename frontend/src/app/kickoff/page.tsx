"use client";

import { useEffect, useState } from "react";
import styles from "./kickoff.module.css";
import Link from "next/link";

interface SalesOrder {
  id: string;
  customer_name: string;
  po_number: string;
  internal_project_number?: string;
  project_name?: string;
  responsible_person?: string;
  sales_rep?: string;
  target_ship_date: string;
  status: string;
}

interface Machine {
  id: string;
  sales_order_id: string;
  order_number: string;
  model_type: string;
  status: string;
}

export default function SalesDashboard() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  
  const [customerName, setCustomerName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [internalProjectNumber, setInternalProjectNumber] = useState("");
  const [projectName, setProjectName] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const [spawningOrder, setSpawningOrder] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [newMachineModel, setNewMachineModel] = useState("");
  const [newMachineSN, setNewMachineSN] = useState("");

  useEffect(() => {
    fetchOrders();
    fetchMachines();

    const eventSource = new EventSource('http://localhost:8080/api/sse');
    eventSource.addEventListener('sales_order_created', () => fetchOrders());
    eventSource.addEventListener('sales_order_updated', () => fetchOrders());
    eventSource.addEventListener('sales_order_deleted', () => fetchOrders());
    eventSource.addEventListener('machine_created', () => fetchMachines());

    return () => eventSource.close();
  }, []);

  const fetchOrders = async () => {
    const res = await fetch("http://localhost:8080/api/sales_orders");
    setOrders(await res.json() || []);
  };

  const fetchMachines = async () => {
    const res = await fetch("http://localhost:8080/api/machines");
    setMachines(await res.json() || []);
  };

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("http://localhost:8080/api/sales_orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: customerName,
        po_number: poNumber,
        internal_project_number: internalProjectNumber,
        project_name: projectName,
        responsible_person: responsiblePerson,
        sales_rep: salesRep,
        target_ship_date: targetDate ? new Date(targetDate).toISOString() : undefined,
      }),
    });
    setCustomerName("");
    setPoNumber("");
    setInternalProjectNumber("");
    setProjectName("");
    setResponsiblePerson("");
    setSalesRep("");
    setTargetDate("");
  };

  const updateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    await fetch(`http://localhost:8080/api/sales_orders/${editingOrder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingOrder),
    });
    setEditingOrder(null);
  };

  const deleteOrder = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this project? This cannot be undone.")) return;
    await fetch(`http://localhost:8080/api/sales_orders/${id}`, {
      method: "DELETE",
    });
  };

  const deleteMachine = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this part/machine?")) return;
    await fetch(`http://localhost:8080/api/machines/${id}`, {
      method: "DELETE",
    });
  };

  const spawnMachine = async (orderId: string) => {
    if (!newMachineModel || !newMachineSN) return;
    await fetch("http://localhost:8080/api/machines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sales_order_id: orderId,
        order_number: newMachineSN,
        model_type: newMachineModel,
      }),
    });
    setSpawningOrder(null);
    setNewMachineModel("");
    setNewMachineSN("");
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Project Kickoff</h1>
      </header>

      <section className={styles.card}>
        <h2 style={{ marginBottom: "1.5rem", color: "var(--vtr-theme-primary)" }}>New Sales Order</h2>
        <form onSubmit={createOrder}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Customer Name</label>
              <input required className={styles.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>PO Number</label>
              <input required className={styles.input} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-12345" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Internal Project #</label>
              <input className={styles.input} value={internalProjectNumber} onChange={e => setInternalProjectNumber(e.target.value)} placeholder="PRJ-9942" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Project Name</label>
              <input className={styles.input} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="VibroBowl Automation" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Responsible Person (PM)</label>
              <input className={styles.input} value={responsiblePerson} onChange={e => setResponsiblePerson(e.target.value)} placeholder="Bob Manager" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sales Rep</label>
              <input className={styles.input} value={salesRep} onChange={e => setSalesRep(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Target Ship Date</label>
              <input type="date" className={styles.input} value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="vtr-btn">Create Order</button>
        </form>
      </section>

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
                        <select className={styles.input} value={editingOrder.status} onChange={e => setEditingOrder({...editingOrder, status: e.target.value})}>
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
                    <button className="vtr-btn vtr-btn-secondary" onClick={() => setSpawningOrder(spawningOrder === order.id ? null : order.id)}>+ Spawn</button>
                    <button className="vtr-btn vtr-btn-secondary" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} onClick={() => deleteOrder(order.id)}>🗑️</button>
                  </div>
                </div>

                {spawningOrder === order.id && (
                  <div className={styles.machineSpawner}>
                    <input className={styles.input} style={{ flex: 1 }} placeholder="Part (e.g. Housing Base)" value={newMachineModel} onChange={e => setNewMachineModel(e.target.value)} />
                    <input className={styles.input} style={{ flex: 1 }} placeholder="S/N or Internal Tracking" value={newMachineSN} onChange={e => setNewMachineSN(e.target.value)} />
                    <button className="vtr-btn" onClick={() => spawnMachine(order.id)}>Spawn</button>
                  </div>
                )}

                {orderMachines.length > 0 && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {orderMachines.map(m => (
                      <Link key={m.id} href={`/machine/${m.id}`} style={{ textDecoration: 'none' }}>
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
