import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { Defect } from '../types';

export function useDepartmentIssues(departmentKey: string) {
  const [issues, setIssues] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const defects = await fetchApi<Defect[]>(`defects`, { params: { department: departmentKey } });
        setIssues(defects || []);
      } catch (err) {
        console.error(`Failed to load data for ${departmentKey}`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [departmentKey]);

  useSSE('defect_updated', (updated: Defect) => {
    if (updated.assigned_department === departmentKey) {
      setIssues(prev => {
        const exists = prev.find(f => f.id === updated.id);
        if (exists) return prev.map(f => f.id === updated.id ? { ...updated, order_number: f.order_number } : f);
        return [...prev, updated];
      });
    } else {
      setIssues(prev => prev.filter(f => f.id !== updated.id));
    }
  });

  useSSE('defect_added', (added: Defect) => {
    if (added.assigned_department === departmentKey) {
      setIssues(prev => {
        if (prev.find(d => d.id === added.id)) return prev;
        return [...prev, added];
      });
    }
  });

  useSSE('defect_deleted', (deleted: { id: string }) => {
    setIssues(prev => prev.filter(d => d.id !== deleted.id));
  });

  useSSE('machine_deleted', (deleted: { id: string }) => {
    setIssues(prev => prev.filter(d => d.machine_id !== deleted.id));
  });

  return { issues, loading };
}
