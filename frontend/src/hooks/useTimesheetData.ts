import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { useSSE } from '../components/SSEProvider';
import {
  TimeEntry,
  MachineLaborSummary,
  ProjectTask,
  DepartmentTask,
  WeeklyTimesheet,
  WeeklyTimesheetSaveRequest,
  CreateTimeEntryRequest,
  CreateProjectTaskRequest,
  UpdateTaskQuoteRequest,
  CreateDepartmentTaskRequest,
  UpdateDepartmentTaskRequest,
  MachineLaborCorrelationReport,
} from '../types';

export function useTimesheetData(selectedMachineId?: string) {
  const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
  const [weeklyTimesheet, setWeeklyTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [approvals, setApprovals] = useState<WeeklyTimesheet[]>([]);
  const [machineSummary, setMachineSummary] = useState<MachineLaborSummary | null>(null);
  const [correlationReport, setCorrelationReport] = useState<MachineLaborCorrelationReport | null>(null);
  const [quotingReview, setQuotingReview] = useState<MachineLaborSummary[]>([]);
  const [departmentTasks, setDepartmentTasks] = useState<DepartmentTask[]>([]);
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

  const fetchMachineLaborCorrelation = useCallback(async (machineId: string) => {
    try {
      const data = await fetchApi<MachineLaborCorrelationReport>(`machines/${machineId}/labor-correlation`);
      if (data && !Array.isArray(data) && Array.isArray(data.tasks)) {
        setCorrelationReport(data);
        return data;
      }
      setCorrelationReport(null);
      return null;
    } catch (err) {
      console.error('Failed to load machine labor correlation report', err);
      setCorrelationReport(null);
      return null;
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

  const fetchDepartmentTasks = useCallback(async (department?: string) => {
    try {
      const params: Record<string, string> = {};
      if (department) params.department = department;
      const data = await fetchApi<DepartmentTask[]>('department-tasks', { params });
      setDepartmentTasks(data || []);
    } catch (err) {
      console.error('Failed to load department tasks catalog', err);
    }
  }, []);

  useEffect(() => {
    fetchMyEntries();
    fetchDepartmentTasks();
  }, [fetchMyEntries, fetchDepartmentTasks]);

  useEffect(() => {
    if (selectedMachineId) {
      fetchMachineSummary(selectedMachineId);
      fetchMachineLaborCorrelation(selectedMachineId);
    } else {
      setMachineSummary(null);
      setCorrelationReport(null);
    }
  }, [selectedMachineId, fetchMachineSummary, fetchMachineLaborCorrelation]);

  // SSE listeners
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

  useSSE('department_task_created', (newTask: DepartmentTask) => {
    setDepartmentTasks(prev => {
      if (prev.find(t => t.id === newTask.id)) return prev.map(t => t.id === newTask.id ? newTask : t);
      return [...prev, newTask];
    });
  });

  useSSE('department_task_updated', (updated: DepartmentTask) => {
    setDepartmentTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  useSSE('department_task_deleted', (data: { id: string }) => {
    setDepartmentTasks(prev => prev.filter(t => t.id !== data.id));
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

  const createDepartmentTask = async (req: CreateDepartmentTaskRequest): Promise<DepartmentTask> => {
    const created = await fetchApi<DepartmentTask>('department-tasks', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    setDepartmentTasks(prev => [...prev.filter(t => t.id !== created.id), created]);
    return created;
  };

  const fetchWeeklyTimesheet = useCallback(async (weekStart?: string, userId?: string): Promise<WeeklyTimesheet | null> => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (weekStart) params.week_start = weekStart;
      if (userId) params.user_id = userId;
      const data = await fetchApi<WeeklyTimesheet>('timesheets/weekly', { params });
      setWeeklyTimesheet(data);
      return data;
    } catch (err) {
      console.error('Failed to load weekly timesheet', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveWeeklyTimesheet = async (id: string, req: WeeklyTimesheetSaveRequest): Promise<WeeklyTimesheet> => {
    const data = await fetchApi<WeeklyTimesheet>(`timesheets/weekly/${id}/save`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
    setWeeklyTimesheet(data);
    return data;
  };

  const submitWeeklyTimesheet = async (id: string): Promise<WeeklyTimesheet> => {
    const data = await fetchApi<WeeklyTimesheet>(`timesheets/weekly/${id}/submit`, {
      method: 'POST',
    });
    setWeeklyTimesheet(data);
    return data;
  };

  const withdrawWeeklyTimesheet = async (id: string): Promise<WeeklyTimesheet> => {
    const data = await fetchApi<WeeklyTimesheet>(`timesheets/weekly/${id}/withdraw`, {
      method: 'POST',
    });
    setWeeklyTimesheet(data);
    return data;
  };

  const fetchApprovals = useCallback(async (filters?: { department?: string; status?: string; week_start?: string }): Promise<WeeklyTimesheet[]> => {
    try {
      const params: Record<string, string> = {};
      if (filters?.department) params.department = filters.department;
      if (filters?.status) params.status = filters.status;
      if (filters?.week_start) params.week_start = filters.week_start;
      const data = await fetchApi<WeeklyTimesheet[]>('timesheets/approvals', { params });
      setApprovals(data || []);
      return data || [];
    } catch (err) {
      console.error('Failed to load timesheet approvals', err);
      return [];
    }
  }, []);

  const approveWeeklyTimesheet = async (id: string): Promise<WeeklyTimesheet> => {
    const data = await fetchApi<WeeklyTimesheet>(`timesheets/weekly/${id}/approve`, {
      method: 'POST',
    });
    setApprovals(prev => prev.map(t => t.id === id ? data : t));
    if (weeklyTimesheet && weeklyTimesheet.id === id) {
      setWeeklyTimesheet(data);
    }
    return data;
  };

  const rejectWeeklyTimesheet = async (id: string, reason: string): Promise<WeeklyTimesheet> => {
    const data = await fetchApi<WeeklyTimesheet>(`timesheets/weekly/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setApprovals(prev => prev.map(t => t.id === id ? data : t));
    if (weeklyTimesheet && weeklyTimesheet.id === id) {
      setWeeklyTimesheet(data);
    }
    return data;
  };

  // SSE listeners for weekly timesheet lifecycle
  useSSE('weekly_timesheet_updated', (updated: WeeklyTimesheet) => {
    if (weeklyTimesheet && weeklyTimesheet.id === updated.id) {
      setWeeklyTimesheet(updated);
    }
    setApprovals(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  useSSE('weekly_timesheet_submitted', (updated: WeeklyTimesheet) => {
    if (weeklyTimesheet && weeklyTimesheet.id === updated.id) {
      setWeeklyTimesheet(updated);
    }
    setApprovals(prev => {
      const exists = prev.some(t => t.id === updated.id);
      return exists ? prev.map(t => t.id === updated.id ? updated : t) : [updated, ...prev];
    });
  });

  useSSE('weekly_timesheet_withdrawn', (updated: WeeklyTimesheet) => {
    if (weeklyTimesheet && weeklyTimesheet.id === updated.id) {
      setWeeklyTimesheet(updated);
    }
    setApprovals(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  useSSE('weekly_timesheet_approved', (updated: WeeklyTimesheet) => {
    if (weeklyTimesheet && weeklyTimesheet.id === updated.id) {
      setWeeklyTimesheet(updated);
    }
    setApprovals(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  useSSE('weekly_timesheet_rejected', (updated: WeeklyTimesheet) => {
    if (weeklyTimesheet && weeklyTimesheet.id === updated.id) {
      setWeeklyTimesheet(updated);
    }
    setApprovals(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  const updateDepartmentTask = async (id: string, req: UpdateDepartmentTaskRequest): Promise<DepartmentTask> => {
    const updated = await fetchApi<DepartmentTask>(`department-tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
    setDepartmentTasks(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const deleteDepartmentTask = async (id: string): Promise<void> => {
    await fetchApi(`department-tasks/${id}`, { method: 'DELETE' });
    setDepartmentTasks(prev => prev.filter(t => t.id !== id));
  };

  useSSE('department_task_created', (newTask: DepartmentTask) => {
    setDepartmentTasks(prev => {
      if (prev.find(t => t.id === newTask.id)) return prev;
      return [newTask, ...prev];
    });
  });

  useSSE('department_task_updated', (updated: DepartmentTask) => {
    setDepartmentTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  });

  return {
    myEntries,
    weeklyTimesheet,
    approvals,
    machineSummary,
    correlationReport,
    quotingReview,
    departmentTasks,
    loading,
    fetchMyEntries,
    fetchWeeklyTimesheet,
    saveWeeklyTimesheet,
    submitWeeklyTimesheet,
    withdrawWeeklyTimesheet,
    fetchApprovals,
    approveWeeklyTimesheet,
    rejectWeeklyTimesheet,
    fetchMachineSummary,
    fetchMachineLaborCorrelation,
    fetchQuotingReview,
    fetchDepartmentTasks,
    logTime,
    deleteEntry,
    createOrUpdateTask,
    updateTaskQuote,
    createDepartmentTask,
    updateDepartmentTask,
    deleteDepartmentTask,
  };
}

