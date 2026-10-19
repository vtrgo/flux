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
	Status                string     `json:"status"` // open, partially_shipped, fulfilled, closed
	CreatedAt             time.Time  `json:"created_at"`
	CreatedBy             *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy             *uuid.UUID `json:"updated_by,omitempty"`
	CreatedByUserName     *string    `json:"created_by_user_name,omitempty"`
}

// Machine represents the core order/machine being built
type Machine struct {
	ID             uuid.UUID  `json:"id"`
	SalesOrderID   *uuid.UUID `json:"sales_order_id,omitempty"`
	OrderNumber    string     `json:"order_number"`
	ModelType      string     `json:"model_type"`
	Status         string     `json:"status"` // engineering, kitting, assembly, controls, quality, shipped
	ActualShipDate *time.Time `json:"actual_ship_date,omitempty"`
	FATDate        *time.Time `json:"fat_date,omitempty"`
	Lead           *string    `json:"lead,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	CreatedBy      *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy      *uuid.UUID `json:"updated_by,omitempty"`
	CreatedByUserName *string    `json:"created_by_user_name,omitempty"`
}

// User represents a system user
type User struct {
	ID           uuid.UUID  `json:"id"`
	Username     string     `json:"username"`
	Email        *string    `json:"email,omitempty"`
	FirstName    *string    `json:"first_name,omitempty"`
	LastName     *string    `json:"last_name,omitempty"`
	Department   *string    `json:"department,omitempty"`
	Role         *string    `json:"role,omitempty"`
	AuthProvider string     `json:"auth_provider"`
	ExternalID   *string    `json:"external_id,omitempty"`
	PasswordHash string     `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
}

// Defect represents an issue found during quality inspection
type Defect struct {
	ID                 uuid.UUID  `json:"id"`
	MachineID          uuid.UUID  `json:"machine_id"`
	OrderNumber        string     `json:"order_number"`
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
	DueDate            *time.Time `json:"due_date,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`

	// Non-Conformance Report (NCR) fields
	IsNCR             bool       `json:"is_ncr"`
	NCRNumber         *string    `json:"ncr_number,omitempty"`
	Assembler         *string    `json:"assembler,omitempty"`
	Location          *string    `json:"location,omitempty"`
	RootCause         *string    `json:"root_cause,omitempty"`
	CorrectiveAction  *string    `json:"corrective_action,omitempty"`
	CloseoutDate      *time.Time `json:"closeout_date,omitempty"`
	TeamLeadSignature *string    `json:"team_lead_signature,omitempty"`
}

// NCRDetail represents a rich Non-Conformance Report with machine and sales order context
type NCRDetail struct {
	Defect
	InternalProjectNumber *string `json:"internal_project_number,omitempty"`
	ProjectName           *string `json:"project_name,omitempty"`
	CustomerName          *string `json:"customer_name,omitempty"`
}

// NextNCRNumberResponse represents the next available sequential NCR number
type NextNCRNumberResponse struct {
	NextNumber string `json:"next_number"`
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

// TimezoneResponse represents the response containing the current site timezone
type TimezoneResponse struct {
	Timezone string `json:"timezone"`
}

// UpdateTimezoneRequest represents the payload to update the site timezone
type UpdateTimezoneRequest struct {
	Timezone string `json:"timezone"`
}

// TimezoneOption represents a selectable timezone in the predefined list
type TimezoneOption struct {
	ID     string `json:"id"`     // IANA Timezone identifier, e.g. "America/Toronto"
	Name   string `json:"name"`   // Friendly display label, e.g. "Eastern Time (Toronto, New York)"
	Region string `json:"region"` // Geographic region, e.g. "North America"
	Offset string `json:"offset"` // Current offset label, e.g. "UTC-04:00"
}

// ReworkItem represents a component undergoing modification or remaking per SOP 1-003
type ReworkItem struct {
	ID                         uuid.UUID  `json:"id"`
	SalesOrderID               uuid.UUID  `json:"sales_order_id"`
	ProjectName                *string    `json:"project_name,omitempty"`
	CustomerName               *string    `json:"customer_name,omitempty"`
	MachineID                  *uuid.UUID `json:"machine_id,omitempty"`
	OrderNumber                *string    `json:"order_number,omitempty"`
	DefectID                   *uuid.UUID `json:"defect_id,omitempty"`
	IsNCR                      bool       `json:"is_ncr"`
	NCRNumber                  *string    `json:"ncr_number,omitempty"`
	ProjectNumber              string     `json:"project_number"`
	SubAssembly                *string    `json:"sub_assembly,omitempty"`
	PartNumber                 string     `json:"part_number"`
	Description                string     `json:"description"`
	Revision                   string     `json:"revision"`
	Material                   string     `json:"material"`
	Qty                        int        `json:"qty"`
	PartType                   string     `json:"part_type"` // 'NEW' or 'MOD'
	MechDesignerID             *uuid.UUID `json:"mech_designer_id,omitempty"`
	MechDesignerName           *string    `json:"mech_designer_name,omitempty"`
	DateReleasedFromMechDesign *time.Time `json:"date_released_from_mech_design,omitempty"`
	PMReleasedToID             *uuid.UUID `json:"pm_released_to_id,omitempty"`
	PMReleasedToName           *string    `json:"pm_released_to_name,omitempty"`
	PDMVaultReleased           bool       `json:"pdm_vault_released"`
	ReasonForRework            string     `json:"reason_for_rework"`
	DateReleasedToMfg          *time.Time `json:"date_released_to_mfg,omitempty"`
	RequestedCompletionDate    *string    `json:"requested_completion_date,omitempty"`
	PMDeliveredTo              *string    `json:"pm_delivered_to,omitempty"`
	PMDateDelivered            *time.Time `json:"pm_date_delivered,omitempty"`
	ExpectedCompletionDate     *string    `json:"expected_completion_date,omitempty"`
	MaterialOrderedDate        *string    `json:"material_ordered_date,omitempty"`
	AssignedMachinistID        *uuid.UUID `json:"assigned_machinist_id,omitempty"`
	AssignedMachinistName      *string    `json:"assigned_machinist_name,omitempty"`
	DateMfgCompleted           *time.Time `json:"date_mfg_completed,omitempty"`
	PartGivenToOrLeftAt        *string    `json:"part_given_to_or_left_at,omitempty"`
	IsAfterHoursDrop           bool       `json:"is_after_hours_drop"`
	EstimatedHours             float64    `json:"estimated_hours"`
	ActualHours                float64    `json:"actual_hours"`
	RequiresOutsideProcessing  bool       `json:"requires_outside_processing"`
	OutsideVendor              *string    `json:"outside_vendor,omitempty"`
	DateSentForProcessing      *string    `json:"date_sent_for_processing,omitempty"`
	DateExpectedFromProcessing *string    `json:"date_expected_from_processing,omitempty"`
	DateReceivedFromProcessing *string    `json:"date_received_from_processing,omitempty"`
	KittingDeliveredTo         *string    `json:"kitting_delivered_to,omitempty"`
	KittingDateDelivered       *time.Time `json:"kitting_date_delivered,omitempty"`
	Status                     string     `json:"status"`
	AssemblerID                *uuid.UUID `json:"assembler_id,omitempty"`
	AssemblerName              *string    `json:"assembler_name,omitempty"`
	PartsCollectedByPM         bool       `json:"parts_collected_by_pm"`
	IsAssemblerSelfModified    bool       `json:"is_assembler_self_modified"`
	CompletedAt                *time.Time `json:"completed_at,omitempty"`
	CompletedByID              *uuid.UUID `json:"completed_by_id,omitempty"`
	CompletedByName            *string    `json:"completed_by_name,omitempty"`
	CreatedAt                  time.Time  `json:"created_at"`
	UpdatedAt                  time.Time  `json:"updated_at"`
}

// ProjectReworkSummary represents aggregated rework metrics for a sales order / project
type ProjectReworkSummary struct {
	SalesOrderID   uuid.UUID `json:"sales_order_id"`
	TotalActive    int       `json:"total_active"`
	TotalInMfg     int       `json:"total_in_mfg"`
	TotalOutsidePP int       `json:"total_outside_pp"`
	TotalCompleted int       `json:"total_completed"`
	TotalEstHours  float64   `json:"total_est_hours"`
	TotalActHours  float64   `json:"total_act_hours"`
}

// MachineFATReadinessResponse represents quality and rework blockers prior to FAT or shipping
type MachineFATReadinessResponse struct {
	MachineID    uuid.UUID `json:"machine_id"`
	CanProceed   bool      `json:"can_proceed"`
	OpenIssues   int       `json:"open_issues"`
	OpenNCRs     int       `json:"open_ncrs"`
	ActiveRework int       `json:"active_rework"`
	Blockers     []string  `json:"blockers"`
}

// ControlsSchematicRework tracks redlines and sign-offs for master electrical schematics
type ControlsSchematicRework struct {
	ID                         uuid.UUID  `json:"id"`
	SalesOrderID               uuid.UUID  `json:"sales_order_id"`
	MachineID                  uuid.UUID  `json:"machine_id"`
	SchematicNumber            string     `json:"schematic_number"`
	MasterCopyRedlined         bool       `json:"master_copy_redlined"`
	RedlinedByUserID           *uuid.UUID `json:"redlined_by_user_id,omitempty"`
	RedlinedByUserName         *string    `json:"redlined_by_user_name,omitempty"`
	RedlinesDescription        *string    `json:"redlines_description,omitempty"`
	SchematicsDigitallyUpdated bool       `json:"schematics_digitally_updated"`
	UpdatedByUserID            *uuid.UUID `json:"updated_by_user_id,omitempty"`
	UpdatedByUserName          *string    `json:"updated_by_user_name,omitempty"`
	UpdatedAt                  *time.Time `json:"updated_at,omitempty"`
	ChecklistSignedOff         bool       `json:"checklist_signed_off"`
	SignedOffByUserID          *uuid.UUID `json:"signed_off_by_user_id,omitempty"`
	SignedOffByUserName        *string    `json:"signed_off_by_user_name,omitempty"`
	SignedOffAt                *time.Time `json:"signed_off_at,omitempty"`
	CreatedAt                  time.Time  `json:"created_at"`
}

