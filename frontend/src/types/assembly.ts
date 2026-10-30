export type AssemblyStatus = 
  | 'design_draft' 
  | 'ready_for_kitting' 
  | 'kitting_in_progress' 
  | 'kitted' 
  | 'in_assembly' 
  | 'assembled' 
  | 'qc_verified';

export interface KittingPart {
  id: string;
  machine_id: string;
  assembly_id?: string;
  department: string;
  part_number: string;
  description?: string;
  qty_required: number;
  qty_picked: number;
  status: 'pending' | 'in_progress' | 'fulfilled';
  fulfilled_at?: string;
  fulfilled_by?: string;
}

export interface MachineAssembly {
  id: string;
  machine_id: string;
  parent_assembly_id?: string;
  assembly_code: string;
  name: string;
  description?: string;
  drawing_number?: string;
  revision: string;
  department: string;
  quoted_hours: number;
  actual_hours: number;
  variance: number;
  status: AssemblyStatus;
  sequence_order: number;
  created_at: string;
  updated_at: string;
  sub_assemblies?: MachineAssembly[];
  parts?: KittingPart[];
}

export interface ParsedBOMPart {
  part_number: string;
  description?: string;
  qty_required: number;
}

export interface ParsedBOMNode {
  assembly_code: string;
  parent_code?: string;
  name: string;
  description?: string;
  drawing_number?: string;
  revision?: string;
  department?: string;
  quoted_hours?: number;
  parts?: ParsedBOMPart[];
}

export interface BOMValidationError {
  row: number;
  code: string;
  message: string;
}

export interface BOMValidationReport {
  is_valid: boolean;
  total_nodes: number;
  total_parts: number;
  errors?: BOMValidationError[];
  warnings?: string[];
  preview_tree?: MachineAssembly[];
}






