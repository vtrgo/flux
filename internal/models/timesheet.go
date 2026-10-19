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
	TaskName          string        `json:"task_name,omitempty"`
	Department        string        `json:"department,omitempty"`
	ReworkItemID      *uuid.UUID    `json:"rework_item_id,omitempty"`
	ReworkPartNum     string        `json:"rework_part_number,omitempty"`
	DefectID          *uuid.UUID    `json:"defect_id,omitempty"`
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
	TaskCode    string  `json:"task_code"`
	TaskName    string  `json:"task_name"`
	Department  string  `json:"department"`
	QuotedHours float64 `json:"quoted_hours"`
}

type UpdateTaskQuoteRequest struct {
	QuotedHours *float64 `json:"quoted_hours,omitempty"`
	Status      *string  `json:"status,omitempty"`
}

type CreateTimeEntryRequest struct {
	MachineID       *uuid.UUID    `json:"machine_id,omitempty"`
	EntryType       TimeEntryType `json:"entry_type"`
	ProjectTaskID   *uuid.UUID    `json:"project_task_id,omitempty"`
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
	DefaultQuotedHours float64 `json:"default_quoted_hours"`
}

type UpdateDepartmentTaskRequest struct {
	TaskName           *string  `json:"task_name,omitempty"`
	DefaultQuotedHours *float64 `json:"default_quoted_hours,omitempty"`
	IsActive           *bool    `json:"is_active,omitempty"`
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
	WeekStartDate   string                `json:"week_start_date"` // YYYY-MM-DD (ISO Monday)
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
	EntryType       TimeEntryType `json:"entry_type"`
	ProjectTaskID   *uuid.UUID    `json:"project_task_id,omitempty"`
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
