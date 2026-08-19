import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';

export interface DisplayProject {
  id: string;
  customer_name: string;
  po_number: string;
  project_name: string | null;
  internal_project_number: string | null;
  responsible_person: string | null;
  sales_rep: string | null;
  target_ship_date: string | null;
  status: string;
  defects: {
    total_open: number;
    total_pending: number;
    total_closed: number;
  };
  machines: any[];
}

export function usePublicDashboardData() {
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesOrdersRes, summariesRes, machinesRes, machSummariesRes] = await Promise.all([
        fetchApi('/sales_orders'),
        fetchApi('/defects/project_summary'),
        fetchApi('/machines'),
        fetchApi('/defects/machine_summary')
      ]);

      const salesOrders = salesOrdersRes || [];
      const summaries = summariesRes || [];
      const machinesList = machinesRes || [];
      const machSummaries = machSummariesRes || [];

      // Create a map of defect summaries
      const summaryMap = new Map();
      summaries.forEach((s: any) => {
        summaryMap.set(s.sales_order_id, s);
      });

      // Create a map of machine defect summaries
      const machSummaryMap = new Map();
      machSummaries.forEach((s: any) => {
        machSummaryMap.set(s.machine_id, s);
      });

      // Group machines by sales order
      const machinesBySo = new Map();
      machinesList.forEach((m: any) => {
        const mSummary = machSummaryMap.get(m.id) || { total_open: 0, total_pending: 0, total_closed: 0 };
        const machineWithStats = { ...m, defects: mSummary };
        if (!machinesBySo.has(m.sales_order_id)) {
          machinesBySo.set(m.sales_order_id, []);
        }
        machinesBySo.get(m.sales_order_id).push(machineWithStats);
      });

      // Filter to active orders and merge in summaries
      const activeProjects = salesOrders
        .filter((so: any) => so.status !== 'fulfilled' && so.status !== 'shipped')
        .map((so: any) => {
          const summary = summaryMap.get(so.id) || { total_open: 0, total_pending: 0, total_closed: 0 };
          return {
            id: so.id,
            customer_name: so.customer_name,
            po_number: so.po_number,
            project_name: so.project_name || null,
            internal_project_number: so.internal_project_number || null,
            responsible_person: so.responsible_person || null,
            sales_rep: so.sales_rep || null,
            target_ship_date: so.target_ship_date,
            status: so.status,
            defects: {
              total_open: summary.total_open,
              total_pending: summary.total_pending,
              total_closed: summary.total_closed
            },
            machines: machinesBySo.get(so.id) || []
          };
        });

      setProjects(activeProjects);
      setError(null);
    } catch (err: any) {
      console.error("Error loading public dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hook into SSE for realtime updates. Any defect change might affect counts.
  // We re-fetch the data to ensure accuracy.
  useSSE('defect_created', () => {
    loadData();
  });
  useSSE('defect_updated', () => {
    loadData();
  });
  useSSE('defect_deleted', () => {
    loadData();
  });
  useSSE('sales_order_created', () => {
    loadData();
  });
  useSSE('sales_order_updated', () => {
    loadData();
  });
  useSSE('sales_order_deleted', () => {
    loadData();
  });

  return { projects, loading, error };
}
