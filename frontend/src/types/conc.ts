export interface CoNCDepartmentRollup {
  department: string;
  total_hours: number;
  production_hours: number;
  rework_hours: number;
  defect_hours: number;
  ncr_hours: number;
  conc_hours: number;
  conc_cost: number;
  conc_percentage: number;
}

export interface CoNCMachineRollup {
  machine_id: string;
  order_number: string;
  model_type: string;
  project_name: string;
  customer_name: string;
  total_hours: number;
  production_hours: number;
  rework_hours: number;
  defect_hours: number;
  ncr_hours: number;
  conc_hours: number;
  conc_cost: number;
  conc_percentage: number;
}

export interface CoNCSummaryResponse {
  hourly_rate: number;
  total_production_hours: number;
  total_rework_hours: number;
  total_defect_hours: number;
  total_ncr_hours: number;
  total_conc_hours: number;
  total_conc_cost: number;
  rework_cost: number;
  defect_cost: number;
  ncr_cost: number;
  conc_percentage_of_labor: number;
  department_breakdown: CoNCDepartmentRollup[];
  machine_breakdown: CoNCMachineRollup[];
}

export interface CoNCReworkItemDetail {
  id: string;
  part_number: string;
  description: string;
  status: string;
  is_ncr: boolean;
  estimated_hours: number;
  actual_hours: number;
  cost: number;
}

export interface CoNCDefectItemDetail {
  id: string;
  description: string;
  severity: string;
  status: string;
  assigned_department: string;
  is_ncr: boolean;
  ncr_number?: string;
  hours_spent: number;
  cost: number;
}

export interface CoNCMachineDetailResponse {
  machine_id: string;
  order_number: string;
  model_type: string;
  project_name: string;
  customer_name: string;
  hourly_rate: number;
  total_production_hours: number;
  total_rework_hours: number;
  total_defect_hours: number;
  total_ncr_hours: number;
  total_conc_hours: number;
  total_conc_cost: number;
  rework_cost: number;
  defect_cost: number;
  ncr_cost: number;
  conc_percentage_of_labor: number;
  department_breakdown: CoNCDepartmentRollup[];
  rework_items: CoNCReworkItemDetail[];
  defect_items: CoNCDefectItemDetail[];
}

