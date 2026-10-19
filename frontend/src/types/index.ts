export interface SalesOrder {
  id: string;
  customer_name: string;
  po_number: string;
  internal_project_number?: string;
  project_name?: string;
  responsible_person?: string;
  sales_rep?: string;
  target_ship_date?: string;
  actual_ship_date?: string;
  status: 'open' | 'partially_shipped' | 'fulfilled' | 'closed';
  created_at: string;
  created_by_user_name?: string;
}

export interface Machine {
  id: string;
  sales_order_id: string;
  order_number: string;
  model_type: string;
  status: string;
  actual_ship_date?: string;
  fat_date?: string;
  lead?: string;
  created_at: string;
  created_by_user_name?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  role?: string;
  auth_provider?: string;
  external_id?: string;
}

export interface Defect {
  id: string;
  machine_id: string;
  order_number: string;
  inspection_id?: string;
  source_department: string;
  assigned_department: string;
  assigned_user_id?: string;
  assigned_user_name?: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
  fixed_by_user_id?: string;
  fixed_by_user_name?: string;
  verified_by_user_id?: string;
  verified_by_user_name?: string;
  description: string;
  severity: string;
  status: string; // 'open', 'fixed', 'verified'
  notes?: string;
  resolved_by?: string;
  resolved_at?: string;
  due_date?: string;
  created_at: string;
  is_ncr?: boolean;
  ncr_number?: string;
  assembler?: string;
  location?: string;
  root_cause?: string;
  corrective_action?: string;
  closeout_date?: string;
  team_lead_signature?: string;
}

export interface NCR extends Defect {
  order_number: string;
  internal_project_number?: string;
  project_name?: string;
  customer_name?: string;
}

export interface Attachment {
  id: string;
  issue_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
}

export interface CreateNCRRequest {
  machine_id: string;
  ncr_number?: string;
  assembler: string;
  location: string;
  description: string;
  severity?: string;
  source_department?: string;
  assigned_department?: string;
  assigned_user_id?: string;
  notes?: string;
  due_date?: string;
  root_cause?: string;
  corrective_action?: string;
  closeout_date?: string;
  team_lead_signature?: string;
  send_notification?: boolean;
  upgrade_from_defect_id?: string;
}

export interface UpdateNCRRequest {
  status?: string;
  assembler?: string;
  location?: string;
  description?: string;
  severity?: string;
  notes?: string;
  assigned_department?: string;
  assigned_user_id?: string;
  due_date?: string;
  root_cause?: string;
  corrective_action?: string;
  closeout_date?: string;
  team_lead_signature?: string;
  send_notification?: boolean;
}

export interface NextNCRNumberResponse {
  next_number: string;
}

export interface DefectSummary {
  machine_id: string;
  assigned_department: string;
  total: number;
  total_open: number;
  total_pending: number;
  open_critical: number;
  open_moderate: number;
  open_minor: number;
  pending_critical: number;
  pending_moderate: number;
  pending_minor: number;
  closed: number;
}

export interface ProjectDefectSummary {
  sales_order_id: string;
  total_open: number;
  total_pending: number;
  total_closed: number;
}

export interface MachineDefectSummary {
  machine_id: string;
  total_open: number;
  total_pending: number;
  total_closed: number;
}

export interface ProjectDepartmentDefectSummary {
  sales_order_id: string;
  assigned_department: string;
  total_open: number;
  total_pending: number;
  total_closed: number;
}

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
  department_totals: Record<string, { total_open: number; total_pending: number }>;
  machines: (Machine & { 
    departmentDefects: DefectSummary[];
    machine_totals: { total_open: number; total_pending: number };
  })[];
}

export interface TimezoneOption {
  id: string;
  name: string;
  region: string;
  offset: string;
}

export interface CreateDefectRequest {
  source_department: string;
  assigned_department: string;
  assigned_user_id?: string;
  description: string;
  severity: string;
  notes?: string;
  due_date?: string;
  send_notification?: boolean;
}

export interface InAppAlert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  department?: string;
  machine_id?: string;
  machine_number?: string;
  recipient_email?: string;
  opened_by?: string;
  created_at: string;
  read: boolean;
}

export type ReworkStatus = 
  | 'design_draft'
  | 'released_to_pm'
  | 'released_to_mfg'
  | 'in_machining'
  | 'outside_processing'
  | 'delivered_to_pm'
  | 'delivered_to_assembly'
  | 'complete'
  | 'cancelled';

export type ReworkPartType = 'NEW' | 'MOD';

export interface ReworkItem {
  id: string;
  sales_order_id: string;
  project_name?: string;
  customer_name?: string;
  machine_id?: string;
  order_number?: string;
  defect_id?: string;
  is_ncr: boolean;
  ncr_number?: string;
  project_number: string;
  sub_assembly?: string;
  part_number: string;
  description: string;
  revision: string;
  material: string;
  qty: number;
  part_type: ReworkPartType;
  mech_designer_id?: string;
  mech_designer_name?: string;
  date_released_from_mech_design?: string;
  pm_released_to_id?: string;
  pm_released_to_name?: string;
  pdm_vault_released: boolean;
  reason_for_rework: string;
  date_released_to_mfg?: string;
  requested_completion_date?: string;
  pm_delivered_to?: string;
  pm_date_delivered?: string;
  expected_completion_date?: string;
  material_ordered_date?: string;
  assigned_machinist_id?: string;
  assigned_machinist_name?: string;
  date_mfg_completed?: string;
  part_given_to_or_left_at?: string;
  is_after_hours_drop: boolean;
  estimated_hours: number;
  actual_hours: number;
  requires_outside_processing: boolean;
  outside_vendor?: string;
  date_sent_for_processing?: string;
  date_expected_from_processing?: string;
  date_received_from_processing?: string;
  kitting_delivered_to?: string;
  kitting_date_delivered?: string;
  status: ReworkStatus;
  assembler_id?: string;
  assembler_name?: string;
  parts_collected_by_pm: boolean;
  is_assembler_self_modified: boolean;
  completed_at?: string;
  completed_by_id?: string;
  completed_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectReworkSummary {
  sales_order_id: string;
  total_active: number;
  total_in_mfg: number;
  total_outside_pp: number;
  total_completed: number;
  total_est_hours: number;
  total_act_hours: number;
}

export interface MachineFATReadinessResponse {
  machine_id: string;
  can_proceed: boolean;
  open_issues: number;
  open_ncrs: number;
  active_rework: number;
  blockers: string[];
}

export interface ControlsSchematicRework {
  id: string;
  sales_order_id: string;
  machine_id: string;
  schematic_number: string;
  master_copy_redlined: boolean;
  redlined_by_user_id?: string;
  redlined_by_user_name?: string;
  redlines_description?: string;
  schematics_digitally_updated: boolean;
  updated_by_user_id?: string;
  updated_by_user_name?: string;
  updated_at?: string;
  checklist_signed_off: boolean;
  signed_off_by_user_id?: string;
  signed_off_by_user_name?: string;
  signed_off_at?: string;
  created_at: string;
}

export interface CreateReworkItemRequest {
  sales_order_id?: string;
  machine_id?: string;
  defect_id?: string;
  project_number?: string;
  sub_assembly?: string;
  part_number: string;
  description: string;
  revision: string;
  material: string;
  qty?: number;
  part_type?: ReworkPartType;
  mech_designer_id?: string;
  date_released_from_mech_design?: string;
  pm_released_to_id?: string;
  pdm_vault_released?: boolean;
  reason_for_rework: string;
  estimated_hours?: number;
  assembler_id?: string;
  is_assembler_self_modified?: boolean;
}

export interface UpdateReworkItemRequest {
  project_number?: string;
  sub_assembly?: string;
  part_number?: string;
  description?: string;
  revision?: string;
  material?: string;
  qty?: number;
  part_type?: ReworkPartType;
  pdm_vault_released?: boolean;
  reason_for_rework?: string;
  pm_released_to_id?: string;
  date_released_to_mfg?: string;
  requested_completion_date?: string;
  pm_delivered_to?: string;
  expected_completion_date?: string;
  material_ordered_date?: string;
  assigned_machinist_id?: string;
  date_mfg_completed?: string;
  part_given_to_or_left_at?: string;
  estimated_hours?: number;
  actual_hours?: number;
  requires_outside_processing?: boolean;
  outside_vendor?: string;
  date_sent_for_processing?: string;
  date_expected_from_processing?: string;
  date_received_from_processing?: string;
  kitting_delivered_to?: string;
  status?: ReworkStatus;
  parts_collected_by_pm?: boolean;
  assembler_id?: string;
}

export type TimeEntryType = 'production' | 'rework' | 'issue_fix' | 'indirect';

export interface ProjectTask {
  id: string;
  machine_id: string;
  order_number?: string;
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
  machine_id?: string;
  order_number?: string;
  entry_type: TimeEntryType;
  project_task_id?: string;
  task_name?: string;
  rework_item_id?: string;
  rework_part_number?: string;
  defect_id?: string;
  work_date: string;
  hours_spent: number;
  work_description?: string;
  created_at: string;
  updated_at: string;
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
  rework_item_id?: string;
  defect_id?: string;
  work_date?: string;
  hours_spent: number;
  work_description?: string;
}

