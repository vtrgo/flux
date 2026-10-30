export type TimeEntryType = 'production' | 'rework' | 'issue_fix' | 'indirect';

export interface ProjectTask {
  id: string;
  machine_id: string;
  order_number?: string;
  task_id?: string;
  task_code: string;
  task_name: string;
  department: string;
  quoted_hours: number;
  actual_hours: number;
  variance: number;
  status: 'open' | 'completed' | 'blocked';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  user_name?: string;
  weekly_timesheet_id?: string;
  machine_id?: string;
  order_number?: string;
  entry_type: TimeEntryType;
  project_task_id?: string;
  task_id?: string;
  task_name?: string;
  department?: string;
  rework_item_id?: string;
  rework_part_number?: string;
  defect_id?: string;
  assembly_id?: string;
  assembly_code?: string;
  assembly_name?: string;
  work_date: string;
  hours_spent: number;
  work_description?: string;
  created_at: string;
  updated_at: string;
}

export type WeeklyTimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface WeeklyTimesheet {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  department: string;
  week_start_date: string; // YYYY-MM-DD (Sunday)
  status: WeeklyTimesheetStatus;
  total_hours: number;
  notes?: string;
  submitted_at?: string;
  submitted_by?: string;
  approved_at?: string;
  approved_by?: string;
  approver_name?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  entries?: TimeEntry[];
}

export interface WeeklyTimesheetSaveItem {
  id?: string;
  machine_id?: string;
  assembly_id?: string;
  entry_type: TimeEntryType;
  project_task_id?: string;
  task_id?: string;
  rework_item_id?: string;
  defect_id?: string;
  department?: string;
  work_date: string;
  hours_spent: number;
  work_description?: string;
}

export interface WeeklyTimesheetSaveRequest {
  notes?: string;
  entries: WeeklyTimesheetSaveItem[];
}

export interface RejectTimesheetRequest {
  reason: string;
}

export interface PrintableTimesheetRow {
  rowKey?: string;
  order_number?: string;
  assembly_code?: string;
  assembly_name?: string;
  task_name: string;
  department?: string;
  entry_type?: TimeEntryType;
  days: Record<string, number | undefined>;
}

export interface TimesheetDayCol {
  dateStr: string;
  dayName: string;
  mdFormatted: string;
}

export interface TimesheetRowPrintData {
  orderNumber?: string;
  assemblyLabel?: string;
  taskName?: string;
  jobLabel: string;
  days: Record<string, number | undefined>;
  rowTotal: number;
}

export interface TimesheetPrintParams {
  employeeName: string;
  department?: string;
  weekEndingDate: string;
  weekDays: TimesheetDayCol[];
  rows: TimesheetRowPrintData[];
  totalTargetRows?: number;
  dayTotals: Record<string, number>;
  grandTotal: number;
  isOvertime: boolean;
  timesheetId?: string;
  status?: string;
  isApproved?: boolean;
  approverName?: string;
  approvalDate?: string;
  notes?: string;
}

export interface MachineLaborSummary {
  machine_id: string;
  order_number: string;
  model_type: string;
  status: string;
  total_quoted_hours: number;
  total_production_hours: number;
  total_rework_hours: number;
  total_issue_fix_hours: number;
  total_actual_hours: number;
  production_variance: number;
  tasks?: ProjectTask[];
}

export interface CreateProjectTaskRequest {
  task_id?: string;
  task_code: string;
  task_name: string;
  department: string;
  quoted_hours: number;
}

export interface UpdateTaskQuoteRequest {
  quoted_hours?: number;
  status?: string;
}

export interface CreateTimeEntryRequest {
  machine_id?: string;
  entry_type: TimeEntryType;
  project_task_id?: string;
  task_id?: string;
  rework_item_id?: string;
  defect_id?: string;
  work_date?: string;
  hours_spent: number;
  work_description?: string;
}

export interface DepartmentTask {
  id: string;
  department: string;
  task_code: string;
  task_name: string;
  description?: string;
  default_quoted_hours: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentTaskRequest {
  department: string;
  task_code: string;
  task_name: string;
  description?: string;
  default_quoted_hours: number;
}

export interface UpdateDepartmentTaskRequest {
  department?: string;
  task_code?: string;
  task_name?: string;
  description?: string;
  default_quoted_hours?: number;
  is_active?: boolean;
}

export type CorrelationStatus =
  | 'budgeted_unstarted'
  | 'on_track'
  | 'nearing_limit'
  | 'over_budget'
  | 'unbudgeted';

export interface LaborCorrelationItem {
  task_id?: string;
  task_code: string;
  task_name: string;
  department: string;
  assigned_hours: number;
  consumed_hours: number;
  variance: number;
  burn_percentage: number;
  status: CorrelationStatus;
  project_task_id?: string;
}

export interface DepartmentRollup {
  department: string;
  assigned_hours: number;
  consumed_hours: number;
  variance: number;
  burn_percentage: number;
}

export interface MachineLaborCorrelationReport {
  machine_id: string;
  order_number: string;
  model_type: string;
  status: string;
  total_assigned_hours: number;
  total_consumed_hours: number;
  net_variance: number;
  overall_burn_percentage: number;
  tasks: LaborCorrelationItem[];
  department_breakdown: Record<string, DepartmentRollup>;
}


export interface GridRow {
  rowKey: string;
  machine_id?: string;
  order_number?: string;
  assembly_id?: string;
  assembly_code?: string;
  assembly_name?: string;
  project_task_id?: string;
  task_id?: string;
  rework_item_id?: string;
  defect_id?: string;
  task_name: string;
  department?: string;
  entry_type: TimeEntryType;
  days: Record<string, number>; // dateStr -> hours
  descriptions: Record<string, string>; // dateStr -> description
  entry_ids?: Record<string, string>; // dateStr -> time_entry id
}

