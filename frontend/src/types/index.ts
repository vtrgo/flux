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
  status: 'open' | 'partially_shipped' | 'fulfilled';
  created_at: string;
}

export interface Machine {
  id: string;
  sales_order_id: string;
  order_number: string;
  model_type: string;
  status: string;
  actual_ship_date?: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  role?: string;
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
  created_at: string;
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
