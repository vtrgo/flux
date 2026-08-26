package models

import (
	"time"

	"github.com/google/uuid"
)

// SalesOrder represents a commercial customer order
type SalesOrder struct {
	ID                    uuid.UUID  `json:"id"`
	CustomerName          string     `json:"customer_name"`
	PONumber              string     `json:"po_number"`
	InternalProjectNumber *string    `json:"internal_project_number,omitempty"`
	ProjectName           *string    `json:"project_name,omitempty"`
	ResponsiblePerson     *string    `json:"responsible_person,omitempty"`
	SalesRep              *string    `json:"sales_rep,omitempty"`
	TargetShipDate        *time.Time `json:"target_ship_date,omitempty"`
	ActualShipDate        *time.Time `json:"actual_ship_date,omitempty"`
	Status                string     `json:"status"` // open, partially_shipped, fulfilled
	CreatedAt             time.Time  `json:"created_at"`
}

// Machine represents the core order/machine being built
type Machine struct {
	ID             uuid.UUID  `json:"id"`
	SalesOrderID   *uuid.UUID `json:"sales_order_id,omitempty"`
	OrderNumber    string     `json:"order_number"`
	ModelType      string     `json:"model_type"`
	Status         string     `json:"status"` // engineering, kitting, assembly, controls, quality, shipped
	ActualShipDate *time.Time `json:"actual_ship_date,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`

	// Relational roll-ups for the UI dashboard
	KittingCount  int `json:"kitting_count"`
	AssemblyCount int `json:"assembly_count"`
	ControlsCount int `json:"controls_count"`
	QualityCount  int `json:"quality_count"`
}

// KittingPart represents an item in the Bill of Materials
type KittingPart struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	Department  string     `json:"department"` // assembly or controls
	PartNumber  string     `json:"part_number"`
	Description string     `json:"description"`
	QtyRequired int        `json:"qty_required"`
	QtyPicked   int        `json:"qty_picked"`
	Status      string     `json:"status"` // pending, partial, fulfilled
	FulfilledAt *time.Time `json:"fulfilled_at,omitempty"`
	FulfilledBy *string    `json:"fulfilled_by,omitempty"`
}

// AssemblyTask represents a mechanical build step
type AssemblyTask struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	TaskName    string     `json:"task_name"`
	Status      string     `json:"status"` // pending, in_progress, complete
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	SignedOffBy *string    `json:"signed_off_by,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
}

// EnclosuresTask represents a task in the enclosures department
type EnclosuresTask struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	TaskName    string     `json:"task_name"`
	Status      string     `json:"status"` // pending, in_progress, complete
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	SignedOffBy *string    `json:"signed_off_by,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
}

// ControlsCheckpoint represents electrical/PLC tasks
type ControlsCheckpoint struct {
	ID             uuid.UUID  `json:"id"`
	MachineID      uuid.UUID  `json:"machine_id"`
	CheckpointType string     `json:"checkpoint_type"` // wiring, io_check, plc_firmware
	Description    string     `json:"description"`
	ExpectedValue  *string    `json:"expected_value,omitempty"`
	ActualValue    *string    `json:"actual_value,omitempty"`
	Status         string     `json:"status"` // pending, pass, fail
	SignedOffBy    *string    `json:"signed_off_by,omitempty"`
	SignedOffAt    *time.Time `json:"signed_off_at,omitempty"`
}

// QualityInspection represents a QC check
type QualityInspection struct {
	ID             uuid.UUID  `json:"id"`
	MachineID      uuid.UUID  `json:"machine_id"`
	InspectionType string     `json:"inspection_type"` // pre_fat, fat_runoff
	InspectorName  string     `json:"inspector_name"`
	Status         string     `json:"status"` // in_progress, pass, fail
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
}

// User represents a system user
type User struct {
	ID           uuid.UUID  `json:"id"`
	Username     string     `json:"username"`
	FirstName    *string    `json:"first_name,omitempty"`
	LastName     *string    `json:"last_name,omitempty"`
	Department   *string    `json:"department,omitempty"`
	Role         *string    `json:"role,omitempty"`
	PasswordHash string     `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
}

// Defect represents an issue found during quality inspection
type Defect struct {
	ID                 uuid.UUID  `json:"id"`
	MachineID          uuid.UUID  `json:"machine_id"`
	InspectionID       *uuid.UUID `json:"inspection_id,omitempty"`
	SourceDepartment   string     `json:"source_department"`
	AssignedDepartment string     `json:"assigned_department"`
	AssignedUserID     *uuid.UUID `json:"assigned_user_id,omitempty"`
	AssignedUserName   *string    `json:"assigned_user_name,omitempty"`
	CreatedByUserID    *uuid.UUID `json:"created_by_user_id,omitempty"`
	CreatedByUserName  *string    `json:"created_by_user_name,omitempty"`
	FixedByUserID      *uuid.UUID `json:"fixed_by_user_id,omitempty"`
	FixedByUserName    *string    `json:"fixed_by_user_name,omitempty"`
	VerifiedByUserID   *uuid.UUID `json:"verified_by_user_id,omitempty"`
	VerifiedByUserName *string    `json:"verified_by_user_name,omitempty"`
	Description        string     `json:"description"`
	Severity           string     `json:"severity"`
	Status             string     `json:"status"`
	Notes              *string    `json:"notes,omitempty"`
	ResolvedBy         *string    `json:"resolved_by,omitempty"`
	ResolvedAt         *time.Time `json:"resolved_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// DefectSummary represents aggregated backend counts for defects per department
type DefectSummary struct {
	MachineID          uuid.UUID `json:"machine_id"`
	AssignedDepartment string    `json:"assigned_department"`
	Total              int       `json:"total"`
	TotalOpen          int       `json:"total_open"`
	TotalPending       int       `json:"total_pending"`
	OpenCritical       int       `json:"open_critical"`
	OpenModerate       int       `json:"open_moderate"`
	OpenMinor          int       `json:"open_minor"`
	PendingCritical    int       `json:"pending_critical"`
	PendingModerate    int       `json:"pending_moderate"`
	PendingMinor       int       `json:"pending_minor"`
	Closed             int       `json:"closed"`
}

// ProjectDefectSummary represents aggregated backend counts for defects per project
type ProjectDefectSummary struct {
	SalesOrderID uuid.UUID `json:"sales_order_id"`
	TotalOpen    int       `json:"total_open"`
	TotalPending int       `json:"total_pending"`
	TotalClosed  int       `json:"total_closed"`
}

type MachineDefectSummary struct {
	MachineID    uuid.UUID `json:"machine_id"`
	TotalOpen    int       `json:"total_open"`
	TotalPending int       `json:"total_pending"`
	TotalClosed  int       `json:"total_closed"`
}

type ProjectDepartmentDefectSummary struct {
	SalesOrderID       uuid.UUID `json:"sales_order_id"`
	AssignedDepartment string    `json:"assigned_department"`
	TotalOpen          int       `json:"total_open"`
	TotalPending       int       `json:"total_pending"`
	TotalClosed        int       `json:"total_closed"`
}

type MachineShopTask struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	DefectID    *uuid.UUID `json:"defect_id,omitempty"`
	PartName    string     `json:"part_name"`
	Material    string     `json:"material"`
	Status      string     `json:"status"`
	MachinedBy  *string    `json:"machined_by,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type LaserTask struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	DefectID    *uuid.UUID `json:"defect_id,omitempty"`
	PartName    string     `json:"part_name"`
	Material    string     `json:"material"`
	Status      string     `json:"status"`
	CutBy       *string    `json:"cut_by,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// DesignDocument tracks CAD, BOMs, and Schematics from engineering
type DesignDocument struct {
	ID           uuid.UUID `json:"id"`
	MachineID    uuid.UUID `json:"machine_id"`
	DocumentType string    `json:"document_type"` // cad_model, electrical_schematic, bom
	Version      string    `json:"version"`
	FileURL      *string   `json:"file_url,omitempty"`
	Status       string    `json:"status"` // active, superseded
	UploadedBy   *string   `json:"uploaded_by,omitempty"`
	UploadedAt   time.Time `json:"uploaded_at"`
}

// DesignFeedback tracks engineering change requests back to the design team
type DesignFeedback struct {
	ID               uuid.UUID  `json:"id"`
	MachineID        uuid.UUID  `json:"machine_id"`
	DocumentID       *uuid.UUID `json:"document_id,omitempty"`
	SourceDepartment string     `json:"source_department"` // assembly, controls, quality
	FeedbackType     string     `json:"feedback_type"`     // part_issue, schematic_error, design_flaw
	Description      string     `json:"description"`
	Status           string     `json:"status"` // under_review, approved_eco, rejected, implemented
	ReviewedBy       *string    `json:"reviewed_by,omitempty"`
	ReviewedAt       *time.Time `json:"reviewed_at,omitempty"`
	ResolutionNotes  *string    `json:"resolution_notes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}
