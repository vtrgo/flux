import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import { TimeEntry, MachineLaborSummary, ProjectTask, CreateTimeEntryRequest, CreateProjectTaskRequest, UpdateTaskQuoteRequest } from '../types';

export function useTimesheetData(selectedMachineId?: string) {
  const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
  const [machineSummary, setMachineSummary] = useState<MachineLaborSummary | null>(null);
  const [quotingReview, setQuotingReview] = useState<MachineLaborSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyEntries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<TimeEntry[]>('time-entries/my');
      setMyEntries(data || []);
    } catch (err) {
      console.error('Failed to load my time entries', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMachineSummary = useCallback(async (machineId: string) => {
    try {
      const data = await fetchApi<MachineLaborSummary>(`machines/${machineId}/labor-summary`);
      setMachineSummary(data);
    } catch (err) {
      console.error('Failed to load machine labor summary', err);
    }
  }, []);

  const fetchQuotingReview = useCallback(async () => {
    try {
      const data = await fetchApi<MachineLaborSummary[]>('timesheets/quoting-review');
      setQuotingReview(data || []);
    } catch (err) {
      console.error('Failed to load quoting review report', err);
    }
  }, []);

  useEffect(() => {
    fetchMyEntries();
  }, [fetchMyEntries]);

  useEffect(() => {
    if (selectedMachineId) {
      fetchMachineSummary(selectedMachineId);
    } else {
      setMachineSummary(null);
    }
  }, [selectedMachineId, fetchMachineSummary]);

  useSSE('time_entry_created', (newEntry: TimeEntry) => {
    setMyEntries(prev => {
      if (prev.find(e => e.id === newEntry.id)) return prev;
      return [newEntry, ...prev];
    });
    if (selectedMachineId && newEntry.machine_id === selectedMachineId) {
      fetchMachineSummary(selectedMachineId);
    }
  });

  useSSE('time_entry_deleted', (data: { id: string }) => {
    setMyEntries(prev => prev.filter(e => e.id !== data.id));
    if (selectedMachineId) {
      fetchMachineSummary(selectedMachineId);
    }
  });

  useSSE('timesheet_task_updated', (updatedTask: ProjectTask) => {
    if (selectedMachineId && updatedTask.machine_id === selectedMachineId) {
      fetchMachineSummary(selectedMachineId);
    }
  });

  const logTime = async (req: CreateTimeEntryRequest): Promise<TimeEntry> => {
    const created = await fetchApi<TimeEntry>('time-entries', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    setMyEntries(prev => [created, ...prev.filter(e => e.id !== created.id)]);
    if (selectedMachineId && req.machine_id === selectedMachineId) {
      await fetchMachineSummary(selectedMachineId);
    }
    return created;
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await fetchApi(`time-entries/${id}`, { method: 'DELETE' });
    setMyEntries(prev => prev.filter(e => e.id !== id));
    if (selectedMachineId) {
      await fetchMachineSummary(selectedMachineId);
    }
  };

  const createOrUpdateTask = async (machineId: string, req: CreateProjectTaskRequest): Promise<ProjectTask> => {
    const created = await fetchApi<ProjectTask>(`machines/${machineId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
    if (selectedMachineId === machineId) {
      await fetchMachineSummary(machineId);
    }
    return created;
  };

  const updateTaskQuote = async (taskId: string, req: UpdateTaskQuoteRequest): Promise<ProjectTask> => {
    const updated = await fetchApi<ProjectTask>(`tasks/${taskId}/quote`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
    if (selectedMachineId) {
      await fetchMachineSummary(selectedMachineId);
    }
    return updated;
  };

  return {
    myEntries,
    machineSummary,
    quotingReview,
    loading,
    fetchMyEntries,
    fetchMachineSummary,
    fetchQuotingReview,
    logTime,
    deleteEntry,
    createOrUpdateTask,
    updateTaskQuote,
  };
}
