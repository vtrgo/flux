import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { SalesOrder, ProjectDefectSummary, Machine, DefectSummary, DisplayProject } from '../types';

export function usePublicDashboardData() {
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesOrdersRes, summariesRes, machinesRes, defectSummariesRes, machineTotalsRes, deptTotalsRes] = await Promise.all([
        fetchApi('/sales_orders', { params: { status_neq: 'fulfilled' } }),
        fetchApi('/defects/project_summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/machines', { params: { sales_order_status_neq: 'fulfilled' } }),
        fetchApi('/defects/summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/defects/machine_summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/defects/project_department_summary', { params: { so_status_neq: 'fulfilled' } })
      ]);

      const salesOrders: SalesOrder[] = salesOrdersRes || [];
      const summaries: ProjectDefectSummary[] = summariesRes || [];
      const machinesList: Machine[] = machinesRes || [];
      const defectSummaries: DefectSummary[] = defectSummariesRes || [];
      const machineTotals = machineTotalsRes || [];
      const deptTotals = deptTotalsRes || [];

      // Create a map of defect summaries
      const summaryMap = new Map<string, ProjectDefectSummary>();
      summaries.forEach((s) => {
        summaryMap.set(s.sales_order_id, s);
      });

      const machineTotalMap = new Map();
      machineTotals.forEach((m: any) => machineTotalMap.set(m.machine_id, m));
      
      const deptTotalMap = new Map();
      deptTotals.forEach((d: any) => {
        if (!deptTotalMap.has(d.sales_order_id)) {
          deptTotalMap.set(d.sales_order_id, {});
        }
        deptTotalMap.get(d.sales_order_id)[d.assigned_department] = {
          total_open: d.total_open,
          total_pending: d.total_pending
        };
      });

      // Create a map of machine defect summaries by machine_id (array of department summaries)
      const machSummaryMap = new Map<string, DefectSummary[]>();
      defectSummaries.forEach((s) => {
        if (!machSummaryMap.has(s.machine_id)) {
          machSummaryMap.set(s.machine_id, []);
        }
        machSummaryMap.get(s.machine_id)!.push(s);
      });

      // Group machines by sales order
      const machinesBySo = new Map<string, (Machine & { departmentDefects: DefectSummary[], machine_totals: { total_open: number; total_pending: number } })[]>();
      machinesList.forEach((m) => {
        const mSummaries = machSummaryMap.get(m.id) || [];
        const mTotals = machineTotalMap.get(m.id) || { total_open: 0, total_pending: 0 };
        const machineWithStats = { ...m, departmentDefects: mSummaries, machine_totals: mTotals };
        if (!machinesBySo.has(m.sales_order_id)) {
          machinesBySo.set(m.sales_order_id, []);
        }
        machinesBySo.get(m.sales_order_id)!.push(machineWithStats as any);
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
            department_totals: deptTotalMap.get(so.id) || {},
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

  const refetchSummaries = useCallback(async () => {
    try {
      const [summariesRes, defectSummariesRes, machineTotalsRes, deptTotalsRes] = await Promise.all([
        fetchApi('/defects/project_summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/defects/summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/defects/machine_summary', { params: { so_status_neq: 'fulfilled' } }),
        fetchApi('/defects/project_department_summary', { params: { so_status_neq: 'fulfilled' } })
      ]);

      const summaries: ProjectDefectSummary[] = summariesRes || [];
      const defectSummaries: DefectSummary[] = defectSummariesRes || [];
      const machineTotals = machineTotalsRes || [];
      const deptTotals = deptTotalsRes || [];

      // Create a map of defect summaries
      const summaryMap = new Map<string, ProjectDefectSummary>();
      summaries.forEach((s) => {
        summaryMap.set(s.sales_order_id, s);
      });

      const machineTotalMap = new Map();
      machineTotals.forEach((m: any) => machineTotalMap.set(m.machine_id, m));
      
      const deptTotalMap = new Map();
      deptTotals.forEach((d: any) => {
        if (!deptTotalMap.has(d.sales_order_id)) {
          deptTotalMap.set(d.sales_order_id, {});
        }
        deptTotalMap.get(d.sales_order_id)[d.assigned_department] = {
          total_open: d.total_open,
          total_pending: d.total_pending
        };
      });

      // Create a map of machine defect summaries by machine_id (array of department summaries)
      const machSummaryMap = new Map<string, DefectSummary[]>();
      defectSummaries.forEach((s) => {
        if (!machSummaryMap.has(s.machine_id)) {
          machSummaryMap.set(s.machine_id, []);
        }
        machSummaryMap.get(s.machine_id)!.push(s);
      });

      // Patch the existing projects in state
      setProjects(prevProjects => prevProjects.map(proj => {
        const newProjSummary = summaryMap.get(proj.id) || { total_open: 0, total_pending: 0, total_closed: 0 };
        const newMachines = proj.machines.map(m => {
          return { 
            ...m, 
            departmentDefects: machSummaryMap.get(m.id) || [],
            machine_totals: machineTotalMap.get(m.id) || { total_open: 0, total_pending: 0 }
          };
        });

        return {
          ...proj,
          defects: {
            total_open: newProjSummary.total_open,
            total_pending: newProjSummary.total_pending,
            total_closed: newProjSummary.total_closed
          },
          department_totals: deptTotalMap.get(proj.id) || {},
          machines: newMachines
        };
      }));
    } catch (err) {
      console.error("Failed to refetch summaries:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hook into SSE for realtime updates. Any defect change might affect counts.
  // For high-throughput defect changes, we just patch summaries.
  useSSE('defect_added', refetchSummaries);
  useSSE('defect_updated', refetchSummaries);
  useSSE('defect_deleted', refetchSummaries);

  // Destructive/cascading structural changes trigger a full reload
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
