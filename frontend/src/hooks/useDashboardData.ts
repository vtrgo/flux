import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { SalesOrder, Machine, DefectSummary } from '../types';

export function useDashboardData() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defectSummaries, setDefectSummaries] = useState<DefectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchApi('sales_orders'),
      fetchApi('machines'),
      fetchApi('defects/summary')
    ])
      .then(([ordData, macData, defData]) => {
        setOrders(ordData || []);
        setMachines(macData || []);
        setDefectSummaries(defData || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setLoading(false);
      });
  }, []);

  useSSE('sales_order_created', (added: SalesOrder) => {
    setOrders(prev => {
      if (prev.find(o => o.id === added.id)) return prev;
      return [...prev, added];
    });
  });

  useSSE('sales_order_updated', (updated: SalesOrder) => {
    setOrders(prev => {
      const exists = prev.find(o => o.id === updated.id);
      if (exists) return prev.map(o => o.id === updated.id ? updated : o);
      return [...prev, updated];
    });
  });

  useSSE('sales_order_deleted', (deleted: { id: string }) => {
    setOrders(prev => prev.filter(o => o.id !== deleted.id));
    setMachines(prev => prev.filter(m => m.sales_order_id !== deleted.id));
    fetchApi<DefectSummary[]>('defects/summary').then(res => setDefectSummaries(res || []));
  });

  useSSE('machine_created', (newMachine: Machine) => {
    setMachines(prev => {
      if (prev.find(m => m.id === newMachine.id)) return prev;
      return [newMachine, ...prev];
    });
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    setMachines(prev => prev.filter(m => m.id !== deleted.id));
    fetchApi<DefectSummary[]>('defects/summary').then(res => setDefectSummaries(res || []));
  });

  const refetchSummaries = useCallback(() => {
    fetchApi<DefectSummary[]>('defects/summary').then(res => setDefectSummaries(res || []));
  }, []);

  useSSE('defect_added', refetchSummaries);
  useSSE('defect_updated', refetchSummaries);
  useSSE('defect_deleted', refetchSummaries);

  return { orders, machines, defectSummaries, loading };
}
