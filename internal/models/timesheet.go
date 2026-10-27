package models

import (
	"time"

	"github.com/google/uuid"
)

type TimeEntryType string

const (
	TimeEntryTypeProduction TimeEntryType = "production"
	TimeEntryTypeRework     TimeEntryType = "rework"
	TimeEntryTypeIssueFix   TimeEntryType = "issue_fix"
	TimeEntryTypeIndirect   TimeEntryType = "indirect"
)

type ProjectTask struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	OrderNumber string     `json:"order_number,omitempty"`
	TaskID      *uuid.UUID `json:"task_id,omitempty"`
	TaskCode    string     `json:"task_code"`
	TaskName    string     `json:"task_name"`
	Department  string     `json:"department"`
	QuotedHours float64    `json:"quoted_hours"`
	ActualHours float64    `json:"actual_hours"`
	Variance    float64    `json:"variance"` // Actual - Quoted
	Status      string     `json:"status"`   // 'open', 'completed', 'blocked'
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type TimeEntry struct {
	ID                uuid.UUID     `json:"id"`
	UserID            uuid.UUID     `json:"user_id"`
	UserName          string        `json:"user_name,omitempty"`
	WeeklyTimesheetID *uuid.UUID    `json:"weekly_timesheet_id,omitempty"`
	MachineID         *uuid.UUID    `json:"machine_id,omitempty"`
	OrderNumber       string        `json:"order_number,omitempty"`
	EntryType         TimeEntryType `json:"entry_type"`
	ProjectTaskID     *uuid.UUID    `json:"project_task_id,omitempty"`
	TaskID            *uuid.UUID    `json:"task_id,omitempty"`
	TaskName          string        `json:"task_name,omitempty"`
	Department        string        `json:"department,omitempty"`
	ReworkItemID      *uuid.UUID    `json:"rework_item_id,omitempty"`
	ReworkPartNum     string        `json:"rework_part_number,omitempty"`
	DefectID          *uuid.UUID    `json:"defect_id,omitempty"`
	AssemblyID        *uuid.UUID    `json:"assembly_id,omitempty"`
	AssemblyCode      string        `json:"assembly_code,omitempty"`
	AssemblyName      string        `json:"assembly_name,omitempty"`
	WorkDate          string        `json:"work_date"`
	HoursSpent        float64       `json:"hours_spent"`
	WorkDescription   string        `json:"work_description"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
}

type MachineLaborSummary struct {
	MachineID            uuid.UUID     `json:"machine_id"`
	OrderNumber          string        `json:"order_number"`
	ModelType            string        `json:"model_type"`
	Status               string        `json:"status"`
	TotalQuotedHours     float64       `json:"total_quoted_hours"`
	TotalProductionHours float64       `json:"total_production_hours"`
	TotalReworkHours     float64       `json:"total_rework_hours"`
	TotalIssueFixHours   float64       `json:"total_issue_fix_hours"`
	TotalActualHours     float64       `json:"total_actual_hours"`
	ProductionVariance   float64       `json:"production_variance"` // Production - Quoted
	Tasks                []ProjectTask `json:"tasks,omitempty"`
}

type CreateProjectTaskRequest struct {
	TaskID      *uuid.UUID `json:"task_id,omitempty"`
	TaskCode    string     `json:"task_code"`
	TaskName    string     `json:"task_name"`
	Department  string     `json:"department"`
	QuotedHours float64    `json:"quoted_hours"`
}

type UpdateTaskQuoteRequest struct {
	QuotedHours *float64 `json:"quoted_hours,omitempty"`
	Status      *string  `json:"status,omitempty"`
}

type CreateTimeEntryRequest struct {
	MachineID       *uuid.UUID    `json:"machine_id,omitempty"`
	AssemblyID      *uuid.UUID    `json:"assembly_id,omitempty"`
	EntryType       TimeEntryType `json:"entry_type"`
	ProjectTaskID   *uuid.UUID    `json:"project_task_id,omitempty"`
	TaskID          *uuid.UUID    `json:"task_id,omitempty"`
	ReworkItemID    *uuid.UUID    `json:"rework_item_id,omitempty"`
	DefectID        *uuid.UUID    `json:"defect_id,omitempty"`
	WorkDate        string        `json:"work_date"`
	HoursSpent      float64       `json:"hours_spent"`
	WorkDescription string        `json:"work_description"`
}

type DepartmentTask struct {
	ID                 uuid.UUID  `json:"id"`
	Department         string     `json:"department"`
	TaskCode           string     `json:"task_code"`
	TaskName           string     `json:"task_name"`
	Description        *string    `json:"description,omitempty"`
	DefaultQuotedHours float64    `json:"default_quoted_hours"`
	IsActive           bool       `json:"is_active"`
	CreatedBy          *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type CreateDepartmentTaskRequest struct {
	Department         string  `json:"department"`
	TaskCode           string  `json:"task_code"`
	TaskName           string  `json:"task_name"`
	Description        *string `json:"description,omitempty"`
	DefaultQuotedHours float64 `json:"default_quoted_hours"`
}

type UpdateDepartmentTaskRequest struct {
	Department         *string  `json:"department,omitempty"`
	TaskCode           *string  `json:"task_code,omitempty"`
	TaskName           *string  `json:"task_name,omitempty"`
	Description        *string  `json:"description,omitempty"`
	DefaultQuotedHours *float64 `json:"default_quoted_hours,omitempty"`
	IsActive           *bool    `json:"is_active,omitempty"`
}

type CorrelationStatus string

const (
	CorrelationStatusBudgetedUnstarted CorrelationStatus = "budgeted_unstarted"
	CorrelationStatusOnTrack           CorrelationStatus = "on_track"
	CorrelationStatusNearingLimit      CorrelationStatus = "nearing_limit"
	CorrelationStatusOverBudget        CorrelationStatus = "over_budget"
	CorrelationStatusUnbudgeted        CorrelationStatus = "unbudgeted"
)

type LaborCorrelationItem struct {
	TaskID         *uuid.UUID        `json:"task_id,omitempty"`
	TaskCode       string            `json:"task_code"`
	TaskName       string            `json:"task_name"`
	Department     string            `json:"department"`
	AssignedHours  float64           `json:"assigned_hours"`
	ConsumedHours  float64           `json:"consumed_hours"`
	Variance       float64           `json:"variance"`        // Consumed - Assigned
	BurnPercentage float64           `json:"burn_percentage"` // (Consumed / Assigned) * 100
	Status         CorrelationStatus `json:"status"`
	ProjectTaskID  *uuid.UUID        `json:"project_task_id,omitempty"`
}

type DepartmentRollup struct {
	Department     string  `json:"department"`
	AssignedHours  float64 `json:"assigned_hours"`
	ConsumedHours  float64 `json:"consumed_hours"`
	Variance       float64 `json:"variance"`
	BurnPercentage float64 `json:"burn_percentage"`
}

type MachineLaborCorrelationReport struct {
	MachineID             uuid.UUID                   `json:"machine_id"`
	OrderNumber           string                      `json:"order_number"`
	ModelType             string                      `json:"model_type"`
	Status                string                      `json:"status"`
	TotalAssignedHours    float64                     `json:"total_assigned_hours"`
	TotalConsumedHours    float64                     `json:"total_consumed_hours"`
	NetVariance           float64                     `json:"net_variance"`
	OverallBurnPercentage float64                     `json:"overall_burn_percentage"`
	Tasks                 []LaborCorrelationItem      `json:"tasks"`
	DepartmentBreakdown   map[string]DepartmentRollup `json:"department_breakdown"`
}

type WeeklyTimesheetStatus string

const (
	WeeklyTimesheetStatusDraft     WeeklyTimesheetStatus = "draft"
	WeeklyTimesheetStatusSubmitted WeeklyTimesheetStatus = "submitted"
	WeeklyTimesheetStatusApproved  WeeklyTimesheetStatus = "approved"
	WeeklyTimesheetStatusRejected  WeeklyTimesheetStatus = "rejected"
)

type WeeklyTimesheet struct {
	ID              uuid.UUID             `json:"id"`
	UserID          uuid.UUID             `json:"user_id"`
	UserName        string                `json:"user_name,omitempty"`
	UserEmail       string                `json:"user_email,omitempty"`
	Department      string                `json:"department"`
	WeekStartDate   string                `json:"week_start_date"` // YYYY-MM-DD (ISO Sunday)
	Status          WeeklyTimesheetStatus `json:"status"`
	TotalHours      float64               `json:"total_hours"`
	Notes           string                `json:"notes,omitempty"`
	SubmittedAt     *time.Time            `json:"submitted_at,omitempty"`
	SubmittedBy     *uuid.UUID            `json:"submitted_by,omitempty"`
	ApprovedAt      *time.Time            `json:"approved_at,omitempty"`
	ApprovedBy      *uuid.UUID            `json:"approved_by,omitempty"`
	ApproverName    string                `json:"approver_name,omitempty"`
	RejectionReason string                `json:"rejection_reason,omitempty"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	Entries         []TimeEntry           `json:"entries,omitempty"`
}

type WeeklyTimesheetSaveItem struct {
	ID              *uuid.UUID    `json:"id,omitempty"`
	MachineID       *uuid.UUID    `json:"machine_id,omitempty"`
	AssemblyID      *uuid.UUID    `json:"assembly_id,omitempty"`
	EntryType       TimeEntryType `json:"entry_type"`
	ProjectTaskID   *uuid.UUID    `json:"project_task_id,omitempty"`
	TaskID          *uuid.UUID    `json:"task_id,omitempty"`
	ReworkItemID    *uuid.UUID    `json:"rework_item_id,omitempty"`
	DefectID        *uuid.UUID    `json:"defect_id,omitempty"`
	Department      string        `json:"department,omitempty"`
	WorkDate        string        `json:"work_date"`
	HoursSpent      float64       `json:"hours_spent"`
	WorkDescription string        `json:"work_description,omitempty"`
}

type WeeklyTimesheetSaveRequest struct {
	Notes   *string                   `json:"notes,omitempty"`
	Entries []WeeklyTimesheetSaveItem `json:"entries"`
}

type RejectTimesheetRequest struct {
	Reason string `json:"reason"`
}
