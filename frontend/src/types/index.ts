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

export interface Defect {
  id: string;
  machine_id: string;
  order_number: string;
  source_department: string;
  assigned_department: string;
  description: string;
  severity: string;
  status: string;
  notes?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at?: string;
}

export interface DefectSummary {
  machine_id: string;
  assigned_department: string;
  total: number;
  open_critical: number;
  open_moderate: number;
  open_minor: number;
  pending_critical: number;
  pending_moderate: number;
  pending_minor: number;
  closed: number;
}
