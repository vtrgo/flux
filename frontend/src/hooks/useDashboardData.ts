import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { SalesOrder, Machine, DefectSummary, ProjectDefectSummary } from '../types';

export function useDashboardData() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defectSummaries, setDefectSummaries] = useState<DefectSummary[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectDefectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchApi('sales_orders', { params: { status_neq: 'closed' } }),
      fetchApi('machines', { params: { sales_order_status_neq: 'closed' } }),
      fetchApi('defects/summary'),
      fetchApi('defects/project_summary', { params: { so_status_neq: 'closed' } })
    ])
      .then(([ordData, macData, defData, projData]) => {
        setOrders(ordData || []);
        setMachines(macData || []);
        setDefectSummaries(defData || []);
        setProjectSummaries(projData || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setLoading(false);
      });
  }, []);

  const refetchSummaries = useCallback(() => {
    Promise.all([
      fetchApi<DefectSummary[]>('defects/summary'),
      fetchApi<ProjectDefectSummary[]>('defects/project_summary', { params: { so_status_neq: 'closed' } })
    ]).then(([macData, projData]) => {
      setDefectSummaries(macData || []);
      setProjectSummaries(projData || []);
    });
  }, []);

  useSSE('sales_order_created', (added: SalesOrder) => {
    if (added.status === 'closed') return;
    setOrders(prev => {
      if (prev.find(o => o.id === added.id)) return prev;
      return [...prev, added];
    });
  });

  useSSE('sales_order_updated', (updated: SalesOrder) => {
    setOrders(prev => {
      // If project was closed, remove from active dashboard list
      if (updated.status === 'closed') {
        return prev.filter(o => o.id !== updated.id);
      }
      const exists = prev.find(o => o.id === updated.id);
      if (exists) return prev.map(o => o.id === updated.id ? updated : o);
      return [...prev, updated];
    });
    // If closed or reopened, refresh machines and summaries
    if (updated.status === 'closed' || updated.status === 'open') {
      fetchApi<Machine[]>('machines', { params: { sales_order_status_neq: 'closed' } }).then(macData => {
        if (macData) setMachines(macData);
      });
      refetchSummaries();
    }
  });

  useSSE('sales_order_deleted', (deleted: { id: string }) => {
    setOrders(prev => prev.filter(o => o.id !== deleted.id));
    setMachines(prev => prev.filter(m => m.sales_order_id !== deleted.id));
    refetchSummaries();
  });

  useSSE('machine_created', (newMachine: Machine) => {
    setMachines(prev => {
      if (prev.find(m => m.id === newMachine.id)) return prev;
      return [newMachine, ...prev];
    });
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    setMachines(prev => prev.filter(m => m.id !== deleted.id));
    refetchSummaries();
  });


  useSSE('defect_added', refetchSummaries);
  useSSE('defect_updated', refetchSummaries);
  useSSE('defect_deleted', refetchSummaries);

  return { orders, machines, defectSummaries, projectSummaries, loading };
}
