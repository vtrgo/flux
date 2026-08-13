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
  status: string;
  created_at?: string;
}

export interface Machine {
  id: string;
  sales_order_id: string;
  order_number: string;
  model_type: string;
  status: string;
  created_at?: string;
  actual_ship_date?: string;
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
  created_at?: string;
}
