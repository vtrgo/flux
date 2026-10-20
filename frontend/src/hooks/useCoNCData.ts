import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { CoNCSummaryResponse, CoNCMachineDetailResponse } from '../types';

interface UseCoNCFilters {
  salesOrderId?: string;
  startDate?: string;
  endDate?: string;
  hourlyRate?: number;
}

export function useCoNCData(filters?: UseCoNCFilters) {
  const [summary, setSummary] = useState<CoNCSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const salesOrderId = filters?.salesOrderId;
  const startDate = filters?.startDate;
  const endDate = filters?.endDate;
  const hourlyRate = filters?.hourlyRate;

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (salesOrderId) params.sales_order_id = salesOrderId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (hourlyRate) params.hourly_rate = hourlyRate.toString();

      const data = await fetchApi<CoNCSummaryResponse>('analytics/conc', { params });
      setSummary(data);
    } catch (err) {
      console.error('Failed to load CoNC summary metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [salesOrderId, startDate, endDate, hourlyRate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useSSE('time_entry_created', fetchSummary);
  useSSE('time_entry_deleted', fetchSummary);
  useSSE('defect_added', fetchSummary);
  useSSE('defect_updated', fetchSummary);
  useSSE('rework_updated', fetchSummary);
  useSSE('rework_completed', fetchSummary);

  return { summary, loading, refetch: fetchSummary };
}

export function useMachineCoNCData(machineId?: string, hourlyRate?: number) {
  const [data, setData] = useState<CoNCMachineDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMachineCoNC = useCallback(async () => {
    if (!machineId) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (hourlyRate) params.hourly_rate = hourlyRate.toString();

      const res = await fetchApi<CoNCMachineDetailResponse>(`machines/${machineId}/conc`, { params });
      setData(res);
    } catch (err) {
      console.error(`Failed to load CoNC for machine ${machineId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [machineId, hourlyRate]);

  useEffect(() => {
    fetchMachineCoNC();
  }, [fetchMachineCoNC]);

  useSSE('time_entry_created', fetchMachineCoNC);
  useSSE('time_entry_deleted', fetchMachineCoNC);
  useSSE('defect_added', fetchMachineCoNC);
  useSSE('defect_updated', fetchMachineCoNC);
  useSSE('rework_updated', fetchMachineCoNC);
  useSSE('rework_completed', fetchMachineCoNC);

  return { data, loading, refetch: fetchMachineCoNC };
}
