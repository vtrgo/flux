import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { ReworkItem } from '../types';

interface UseReworkDataFilters {
  salesOrderId?: string;
  machineId?: string;
  view?: 'active' | 'complete' | 'all';
}

export function useReworkData(filters?: UseReworkDataFilters) {
  const [items, setItems] = useState<ReworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filters?.salesOrderId) params.sales_order_id = filters.salesOrderId;
      if (filters?.machineId) params.machine_id = filters.machineId;
      if (filters?.view && filters.view !== 'all') params.view = filters.view;

      const data = await fetchApi<ReworkItem[]>('rework/items', { params });
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load rework items', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.salesOrderId, filters?.machineId, filters?.view]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useSSE('rework_created', (newItem: ReworkItem) => {
    setItems(prev => {
      if (prev.find(i => i.id === newItem.id)) return prev;
      return [newItem, ...prev];
    });
  });

  useSSE('rework_updated', (updatedItem: ReworkItem) => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
  });

  useSSE('rework_completed', (completedItem: ReworkItem) => {
    setItems(prev => {
      if (filters?.view === 'active') {
        return prev.filter(i => i.id !== completedItem.id);
      }
      return prev.map(i => i.id === completedItem.id ? completedItem : i);
    });
  });

  useSSE('rework_deleted', (data: { id: string }) => {
    setItems(prev => prev.filter(i => i.id !== data.id));
  });

  return { items, loading, refetch: fetchItems };
}
