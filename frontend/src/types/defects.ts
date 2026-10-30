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
  label?: string;
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


export interface NCRFormData {
  machine_id: string;
  ncr_number: string;
  date: string;
  assembler: string;
  location: string;
  description: string;
  root_cause: string;
  corrective_action: string;
  closeout_date: string;
  team_lead_signature: string;
  status: string;
}

