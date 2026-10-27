package models

import "github.com/google/uuid"

// CoNCSummaryResponse represents executive Cost of Non-Conformance metrics across the shop
type CoNCSummaryResponse struct {
	HourlyRate            float64                `json:"hourly_rate"`
	TotalProductionHours  float64                `json:"total_production_hours"`
	TotalReworkHours      float64                `json:"total_rework_hours"`
	TotalDefectHours      float64                `json:"total_defect_hours"`
	TotalNCRHours         float64                `json:"total_ncr_hours"`
	TotalCoNCHours        float64                `json:"total_conc_hours"`
	TotalCoNCCost         float64                `json:"total_conc_cost"`
	ReworkCost            float64                `json:"rework_cost"`
	DefectCost            float64                `json:"defect_cost"`
	NCRCost               float64                `json:"ncr_cost"`
	CoNCPercentageOfLabor float64                `json:"conc_percentage_of_labor"`
	DepartmentBreakdown   []CoNCDepartmentRollup `json:"department_breakdown"`
	MachineBreakdown      []CoNCMachineRollup    `json:"machine_breakdown"`
}

// CoNCDepartmentRollup breaks down CoNC metrics by operational department
type CoNCDepartmentRollup struct {
	Department      string  `json:"department"`
	TotalHours      float64 `json:"total_hours"`
	ProductionHours float64 `json:"production_hours"`
	ReworkHours     float64 `json:"rework_hours"`
	DefectHours     float64 `json:"defect_hours"`
	NCRHours        float64 `json:"ncr_hours"`
	CoNCHours       float64 `json:"conc_hours"`
	CoNCCost        float64 `json:"conc_cost"`
	CoNCPercentage  float64 `json:"conc_percentage"`
}

// CoNCMachineRollup breaks down CoNC metrics per machine / project
type CoNCMachineRollup struct {
	MachineID       uuid.UUID `json:"machine_id"`
	OrderNumber     string    `json:"order_number"`
	ModelType       string    `json:"model_type"`
	ProjectName     string    `json:"project_name"`
	CustomerName    string    `json:"customer_name"`
	TotalHours      float64   `json:"total_hours"`
	ProductionHours float64   `json:"production_hours"`
	ReworkHours     float64   `json:"rework_hours"`
	DefectHours     float64   `json:"defect_hours"`
	NCRHours        float64   `json:"ncr_hours"`
	CoNCHours       float64   `json:"conc_hours"`
	CoNCCost        float64   `json:"conc_cost"`
	CoNCPercentage  float64   `json:"conc_percentage"`
}

// CoNCMachineDetailResponse represents machine-level Cost of Non-Conformance details
type CoNCMachineDetailResponse struct {
	MachineID             uuid.UUID              `json:"machine_id"`
	OrderNumber           string                 `json:"order_number"`
	ModelType             string                 `json:"model_type"`
	ProjectName           string                 `json:"project_name"`
	CustomerName          string                 `json:"customer_name"`
	HourlyRate            float64                `json:"hourly_rate"`
	TotalProductionHours  float64                `json:"total_production_hours"`
	TotalReworkHours      float64                `json:"total_rework_hours"`
	TotalDefectHours      float64                `json:"total_defect_hours"`
	TotalNCRHours         float64                `json:"total_ncr_hours"`
	TotalCoNCHours        float64                `json:"total_conc_hours"`
	TotalCoNCCost         float64                `json:"total_conc_cost"`
	ReworkCost            float64                `json:"rework_cost"`
	DefectCost            float64                `json:"defect_cost"`
	NCRCost               float64                `json:"ncr_cost"`
	CoNCPercentageOfLabor float64                `json:"conc_percentage_of_labor"`
	DepartmentBreakdown   []CoNCDepartmentRollup `json:"department_breakdown"`
	ReworkItems           []CoNCReworkItemDetail `json:"rework_items"`
	DefectItems           []CoNCDefectItemDetail `json:"defect_items"`
}

// CoNCReworkItemDetail represents rework item cost details for a machine
type CoNCReworkItemDetail struct {
	ID             uuid.UUID `json:"id"`
	PartNumber     string    `json:"part_number"`
	Description    string    `json:"description"`
	Status         string    `json:"status"`
	IsNCR          bool      `json:"is_ncr"`
	EstimatedHours float64   `json:"estimated_hours"`
	ActualHours    float64   `json:"actual_hours"`
	Cost           float64   `json:"cost"`
}

// CoNCDefectItemDetail represents defect resolution cost details for a machine
type CoNCDefectItemDetail struct {
	ID                 uuid.UUID `json:"id"`
	Description        string    `json:"description"`
	Severity           string    `json:"severity"`
	Status             string    `json:"status"`
	AssignedDepartment string    `json:"assigned_department"`
	IsNCR              bool      `json:"is_ncr"`
	NCRNumber          *string   `json:"ncr_number,omitempty"`
	HoursSpent         float64   `json:"hours_spent"`
	Cost               float64   `json:"cost"`
}
