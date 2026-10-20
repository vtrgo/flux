import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { MachineFATReadinessResponse } from '../types';

export function useMachineFATReadiness(machineId?: string) {
  const [readiness, setReadiness] = useState<MachineFATReadinessResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchReadiness = useCallback(async () => {
    if (!machineId) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchApi<MachineFATReadinessResponse>(`machines/${machineId}/fat-readiness`);
      setReadiness(data);
    } catch (err) {
      console.error(`Failed to load FAT readiness for machine ${machineId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  // Reactive updates on defect or rework lifecycle events
  useSSE('defect_added', fetchReadiness);
  useSSE('defect_updated', fetchReadiness);
  useSSE('defect_deleted', fetchReadiness);
  useSSE('rework_created', fetchReadiness);
  useSSE('rework_updated', fetchReadiness);
  useSSE('rework_completed', fetchReadiness);
  useSSE('rework_deleted', fetchReadiness);

  return { readiness, loading, refetch: fetchReadiness };
}
