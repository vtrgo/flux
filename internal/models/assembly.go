package models

import (
	"time"

	"github.com/google/uuid"
)

type AssemblyStatus string

const (
	AssemblyStatusDesignDraft       AssemblyStatus = "design_draft"
	AssemblyStatusReadyForKitting   AssemblyStatus = "ready_for_kitting"
	AssemblyStatusKittingInProgress AssemblyStatus = "kitting_in_progress"
	AssemblyStatusKitted            AssemblyStatus = "kitted"
	AssemblyStatusInAssembly        AssemblyStatus = "in_assembly"
	AssemblyStatusAssembled         AssemblyStatus = "assembled"
	AssemblyStatusQCVerified        AssemblyStatus = "qc_verified"
)

type MachineAssembly struct {
	ID               uuid.UUID         `json:"id"`
	MachineID        uuid.UUID         `json:"machine_id"`
	ParentAssemblyID *uuid.UUID        `json:"parent_assembly_id,omitempty"`
	AssemblyCode     string            `json:"assembly_code"`
	Name             string            `json:"name"`
	Description      string            `json:"description,omitempty"`
	DrawingNumber    string            `json:"drawing_number,omitempty"`
	Revision         string            `json:"revision"`
	Department       string            `json:"department"`
	QuotedHours      float64           `json:"quoted_hours"`
	ActualHours      float64           `json:"actual_hours"`
	Variance         float64           `json:"variance"`
	Status           AssemblyStatus    `json:"status"`
	SequenceOrder    int               `json:"sequence_order"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
	SubAssemblies    []MachineAssembly `json:"sub_assemblies,omitempty"`
	Parts            []KittingPart     `json:"parts,omitempty"`
}

type KittingPart struct {
	ID          uuid.UUID  `json:"id"`
	MachineID   uuid.UUID  `json:"machine_id"`
	AssemblyID  *uuid.UUID `json:"assembly_id,omitempty"`
	Department  string     `json:"department"`
	PartNumber  string     `json:"part_number"`
	Description string     `json:"description,omitempty"`
	QtyRequired int        `json:"qty_required"`
	QtyPicked   int        `json:"qty_picked"`
	Status      string     `json:"status"` // 'pending', 'in_progress', 'fulfilled'
	FulfilledAt *time.Time `json:"fulfilled_at,omitempty"`
	FulfilledBy *string    `json:"fulfilled_by,omitempty"`
}

type ParsedBOMPart struct {
	PartNumber  string `json:"part_number"`
	Description string `json:"description,omitempty"`
	QtyRequired int    `json:"qty_required"`
}

type ParsedBOMNode struct {
	AssemblyCode  string          `json:"assembly_code"`
	ParentCode    string          `json:"parent_code,omitempty"`
	Name          string          `json:"name"`
	Description   string          `json:"description,omitempty"`
	DrawingNumber string          `json:"drawing_number,omitempty"`
	Revision      string          `json:"revision,omitempty"`
	Department    string          `json:"department,omitempty"`
	QuotedHours   float64         `json:"quoted_hours,omitempty"`
	Parts         []ParsedBOMPart `json:"parts,omitempty"`
}

type BOMValidationError struct {
	Row     int    `json:"row"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type BOMValidationReport struct {
	IsValid     bool                 `json:"is_valid"`
	TotalNodes  int                  `json:"total_nodes"`
	TotalParts  int                  `json:"total_parts"`
	Errors      []BOMValidationError `json:"errors,omitempty"`
	Warnings    []string             `json:"warnings,omitempty"`
	PreviewTree []MachineAssembly    `json:"preview_tree,omitempty"`
}
