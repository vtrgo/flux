import { DefectSummary } from './defects';

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

