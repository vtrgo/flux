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
  uncompleted_assemblies?: number;
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

export interface ReworkFormData {
  sales_order_id: string;
  machine_id: string;
  defect_id: string;
  project_number: string;
  sub_assembly: string;
  part_number: string;
  description: string;
  revision: string;
  material: string;
  qty: number;
  part_type: ReworkPartType;
  mech_designer_id: string;
  pm_released_to_id: string;
  pdm_vault_released: boolean;
  reason_for_rework: string;
  date_released_to_mfg: string;
  requested_completion_date: string;
  pm_delivered_to: string;
  expected_completion_date: string;
  material_ordered_date: string;
  assigned_machinist_id: string;
  date_mfg_completed: string;
  part_given_to_or_left_at: string;
  estimated_hours: number;
  actual_hours: number;
  requires_outside_processing: boolean;
  outside_vendor: string;
  date_sent_for_processing: string;
  date_expected_from_processing: string;
  date_received_from_processing: string;
  kitting_delivered_to: string;
  status: ReworkStatus;
  parts_collected_by_pm: boolean;
  assembler_id: string;
}

