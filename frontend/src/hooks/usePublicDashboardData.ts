import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { SalesOrder, ProjectDefectSummary, Machine, MachineDefectSummary, DisplayProject } from '../types';

export function usePublicDashboardData() {
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesOrdersRes, summariesRes, machinesRes, machSummariesRes] = await Promise.all([
        fetchApi('/sales_orders', { params: { status_neq: 'fulfilled' } }),
        fetchApi('/defects/project_summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/machines', { params: { sales_order_status_neq: 'fulfilled' } }),
        fetchApi('/defects/machine_summary', { params: { so_status_neq: 'fulfilled' } })
      ]);

      const salesOrders: SalesOrder[] = salesOrdersRes || [];
      const summaries: ProjectDefectSummary[] = summariesRes || [];
      const machinesList: Machine[] = machinesRes || [];
      const machSummaries: MachineDefectSummary[] = machSummariesRes || [];

      // Create a map of defect summaries
      const summaryMap = new Map<string, ProjectDefectSummary>();
      summaries.forEach((s) => {
        summaryMap.set(s.sales_order_id, s);
      });

      // Create a map of machine defect summaries
      const machSummaryMap = new Map<string, MachineDefectSummary>();
      machSummaries.forEach((s) => {
        machSummaryMap.set(s.machine_id, s);
      });

      // Group machines by sales order
      const machinesBySo = new Map<string, (Machine & { defects: MachineDefectSummary })[]>();
      machinesList.forEach((m) => {
        const mSummary = machSummaryMap.get(m.id) || { machine_id: m.id, total_open: 0, total_pending: 0, total_closed: 0 };
        const machineWithStats = { ...m, defects: mSummary };
        if (!machinesBySo.has(m.sales_order_id)) {
          machinesBySo.set(m.sales_order_id, []);
        }
        machinesBySo.get(m.sales_order_id)!.push(machineWithStats);
      });

      // Filter to active orders and merge in summaries
      const activeProjects: DisplayProject[] = salesOrders
        .filter((so) => so.status !== 'fulfilled')
        .map((so) => {
          const summary = summaryMap.get(so.id) || { sales_order_id: so.id, total_open: 0, total_pending: 0, total_closed: 0 };
          return {
            id: so.id,
            customer_name: so.customer_name,
            po_number: so.po_number,
            project_name: so.project_name || null,
            internal_project_number: so.internal_project_number || null,
            responsible_person: so.responsible_person || null,
            sales_rep: so.sales_rep || null,
            target_ship_date: so.target_ship_date || null,
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
  useSSE('defect_added', () => {
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
  useSSE('machine_created', () => {
    loadData();
  });
  useSSE('machine_deleted', () => {
    loadData();
  });

  return { projects, loading, error };
}
