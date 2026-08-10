package models

import (
	"time"

	"github.com/google/uuid"
)

// Machine represents the core order/machine being built
type Machine struct {
	ID            uuid.UUID `json:"id"`
	OrderNumber   string    `json:"order_number"`
	ModelType     string    `json:"model_type"`
	Status        string    `json:"status"` // kitting, assembly, controls, quality, shipped
	CreatedAt     time.Time `json:"created_at"`
	
	// Relational roll-ups for the UI dashboard
	KittingCount  int       `json:"kitting_count"`
	AssemblyCount int       `json:"assembly_count"`
	ControlsCount int       `json:"controls_count"`
	QualityCount  int       `json:"quality_count"`
}

// KittingPart represents an item in the Bill of Materials
type KittingPart struct {
	ID           uuid.UUID  `json:"id"`
	MachineID    uuid.UUID  `json:"machine_id"`
	Department   string     `json:"department"` // assembly or controls
	PartNumber   string     `json:"part_number"`
	Description  string     `json:"description"`
	QtyRequired  int        `json:"qty_required"`
	QtyPicked    int        `json:"qty_picked"`
	Status       string     `json:"status"` // pending, partial, fulfilled
	FulfilledAt  *time.Time `json:"fulfilled_at,omitempty"`
	FulfilledBy  *string    `json:"fulfilled_by,omitempty"`
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

// Defect represents an issue found during quality inspection
type Defect struct {
	ID                uuid.UUID  `json:"id"`
	MachineID         uuid.UUID  `json:"machine_id"`
	InspectionID      *uuid.UUID `json:"inspection_id,omitempty"`
	SourceDepartment  string     `json:"source_department"`
	AssignedDepartment string     `json:"assigned_department"`
	Description       string     `json:"description"`
	Severity          string     `json:"severity"`
	Status            string     `json:"status"`
	Notes             *string    `json:"notes,omitempty"`
	ResolvedBy        *string    `json:"resolved_by,omitempty"`
	ResolvedAt        *time.Time `json:"resolved_at,omitempty"`
}

type MachineShopTask struct {
	ID           uuid.UUID  `json:"id"`
	MachineID    uuid.UUID  `json:"machine_id"`
	DefectID     *uuid.UUID `json:"defect_id,omitempty"`
	PartName     string     `json:"part_name"`
	Material     string     `json:"material"`
	Status       string     `json:"status"`
	MachinedBy   *string    `json:"machined_by,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
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
