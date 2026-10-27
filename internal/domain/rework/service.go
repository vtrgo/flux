package rework

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrRequiredFields          = errors.New("Part number, description, revision, and material are required")
	ErrInvalidPartType         = errors.New("part_type must be 'NEW' or 'MOD'")
	ErrSalesOrderRequired      = errors.New("Sales Order ID is required or must be inferrable from machine or defect")
	ErrReworkNotFound          = errors.New("Rework item not found")
	ErrSchematicFieldsRequired = errors.New("Machine ID and schematic number are required")
)

type CreateReworkRequest struct {
	SalesOrderID               *string  `json:"sales_order_id"`
	MachineID                  *string  `json:"machine_id"`
	DefectID                   *string  `json:"defect_id"`
	ProjectNumber              string   `json:"project_number"`
	SubAssembly                *string  `json:"sub_assembly"`
	PartNumber                 string   `json:"part_number"`
	Description                string   `json:"description"`
	Revision                   string   `json:"revision"`
	Material                   string   `json:"material"`
	Qty                        int      `json:"qty"`
	PartType                   string   `json:"part_type"`
	MechDesignerID             *string  `json:"mech_designer_id"`
	DateReleasedFromMechDesign *string  `json:"date_released_from_mech_design"`
	PMReleasedToID             *string  `json:"pm_released_to_id"`
	PDMVaultReleased           bool     `json:"pdm_vault_released"`
	ReasonForRework            string   `json:"reason_for_rework"`
	EstimatedHours             *float64 `json:"estimated_hours"`
	AssemblerID                *string  `json:"assembler_id"`
	IsAssemblerSelfModified    bool     `json:"is_assembler_self_modified"`
	AuthUserID                 string   `json:"-"`
}

type CreateReworkResult struct {
	Item          models.ReworkItem
	UpdatedDefect *models.Defect
}

type UpdateReworkRequest struct {
	ProjectNumber              *string  `json:"project_number"`
	SubAssembly                *string  `json:"sub_assembly"`
	PartNumber                 *string  `json:"part_number"`
	Description                *string  `json:"description"`
	Revision                   *string  `json:"revision"`
	Material                   *string  `json:"material"`
	Qty                        *int     `json:"qty"`
	PartType                   *string  `json:"part_type"`
	PDMVaultReleased           *bool    `json:"pdm_vault_released"`
	ReasonForRework            *string  `json:"reason_for_rework"`
	PMReleasedToID             *string  `json:"pm_released_to_id"`
	DateReleasedToMfg          *string  `json:"date_released_to_mfg"`
	RequestedCompletionDate    *string  `json:"requested_completion_date"`
	PMDeliveredTo              *string  `json:"pm_delivered_to"`
	ExpectedCompletionDate     *string  `json:"expected_completion_date"`
	MaterialOrderedDate        *string  `json:"material_ordered_date"`
	AssignedMachinistID        *string  `json:"assigned_machinist_id"`
	DateMfgCompleted           *string  `json:"date_mfg_completed"`
	PartGivenToOrLeftAt        *string  `json:"part_given_to_or_left_at"`
	EstimatedHours             *float64 `json:"estimated_hours"`
	ActualHours                *float64 `json:"actual_hours"`
	RequiresOutsideProcessing  *bool    `json:"requires_outside_processing"`
	OutsideVendor              *string  `json:"outside_vendor"`
	DateSentForProcessing      *string  `json:"date_sent_for_processing"`
	DateExpectedFromProcessing *string  `json:"date_expected_from_processing"`
	DateReceivedFromProcessing *string  `json:"date_received_from_processing"`
	KittingDeliveredTo         *string  `json:"kitting_delivered_to"`
	Status                     *string  `json:"status"`
	PartsCollectedByPM         *bool    `json:"parts_collected_by_pm"`
	AssemblerID                *string  `json:"assembler_id"`
	AuthUserID                 string   `json:"-"`
}

type UpdateReworkResult struct {
	Item          models.ReworkItem
	UpdatedDefect *models.Defect
}

type CreateControlsSchematicRequest struct {
	SalesOrderID        string
	MachineID           string
	SchematicNumber     string
	MasterCopyRedlined  bool
	RedlinesDescription *string
	AuthUserID          string
}

type UpdateControlsSchematicRequest struct {
	ID                         string
	MasterCopyRedlined         *bool
	RedlinesDescription        *string
	SchematicsDigitallyUpdated *bool
	ChecklistSignedOff         *bool
	AuthUserID                 string
}

// Service defines domain operations for rework management
type Service interface {
	GetReworkItems(ctx context.Context, salesOrderID, machineID, status, view, partType string) ([]models.ReworkItem, error)
	GetReworkItemByID(ctx context.Context, id uuid.UUID) (models.ReworkItem, error)
	CreateReworkItem(ctx context.Context, req CreateReworkRequest) (*CreateReworkResult, error)
	UpdateReworkItem(ctx context.Context, id uuid.UUID, req UpdateReworkRequest) (*UpdateReworkResult, error)
	AfterHoursDrop(ctx context.Context, id uuid.UUID, dropLocation string, assemblerSelfMod bool, note string) (models.ReworkItem, error)
	DeleteReworkItem(ctx context.Context, id uuid.UUID) error
	GetProjectReworkSummary(ctx context.Context, salesOrderID uuid.UUID) (models.ProjectReworkSummary, error)
	GetMachineFATReadiness(ctx context.Context, machineID uuid.UUID) (models.MachineFATReadinessResponse, error)
	GetControlsSchematics(ctx context.Context, salesOrderID, machineID string) ([]models.ControlsSchematicRework, error)
	CreateControlsSchematic(ctx context.Context, req CreateControlsSchematicRequest) (uuid.UUID, error)
	UpdateControlsSchematic(ctx context.Context, req UpdateControlsSchematicRequest) error
}

type service struct {
	repo Repository
}

// NewService creates a new Rework domain service
func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetReworkItems(ctx context.Context, salesOrderID, machineID, status, view, partType string) ([]models.ReworkItem, error) {
	return s.repo.GetReworkItems(ctx, salesOrderID, machineID, status, view, partType)
}

func (s *service) GetReworkItemByID(ctx context.Context, id uuid.UUID) (models.ReworkItem, error) {
	return s.repo.GetReworkItemByID(ctx, id)
}

func (s *service) CreateReworkItem(ctx context.Context, req CreateReworkRequest) (*CreateReworkResult, error) {
	if strings.TrimSpace(req.PartNumber) == "" ||
		strings.TrimSpace(req.Description) == "" ||
		strings.TrimSpace(req.Revision) == "" ||
		strings.TrimSpace(req.Material) == "" {
		return nil, ErrRequiredFields
	}

	if req.Qty <= 0 {
		req.Qty = 1
	}
	if req.PartType == "" {
		req.PartType = "NEW"
	}
	if req.PartType != "NEW" && req.PartType != "MOD" {
		return nil, ErrInvalidPartType
	}

	resolvedSOID, err := s.repo.ResolveSalesOrderID(ctx, req.SalesOrderID, req.MachineID, req.DefectID)
	if err != nil || resolvedSOID == "" {
		return nil, ErrSalesOrderRequired
	}
	soUUID, err := uuid.Parse(resolvedSOID)
	if err != nil {
		return nil, ErrSalesOrderRequired
	}

	projNum := req.ProjectNumber
	if strings.TrimSpace(projNum) == "" {
		projNum, _ = s.repo.GetProjectNumberForSO(ctx, resolvedSOID)
	}

	designerID := req.MechDesignerID
	if (designerID == nil || *designerID == "") && req.AuthUserID != "" {
		designerID = &req.AuthUserID
	}

	var designerUUID *uuid.UUID
	if designerID != nil && *designerID != "" {
		if u, err := uuid.Parse(*designerID); err == nil {
			designerUUID = &u
		}
	}

	var machUUID *uuid.UUID
	if req.MachineID != nil && *req.MachineID != "" {
		if u, err := uuid.Parse(*req.MachineID); err == nil {
			machUUID = &u
		}
	}

	var defUUID *uuid.UUID
	if req.DefectID != nil && *req.DefectID != "" {
		if u, err := uuid.Parse(*req.DefectID); err == nil {
			defUUID = &u
		}
	}

	var pmUUID *uuid.UUID
	if req.PMReleasedToID != nil && *req.PMReleasedToID != "" {
		if u, err := uuid.Parse(*req.PMReleasedToID); err == nil {
			pmUUID = &u
		}
	}

	var asmUUID *uuid.UUID
	if req.AssemblerID != nil && *req.AssemblerID != "" {
		if u, err := uuid.Parse(*req.AssemblerID); err == nil {
			asmUUID = &u
		}
	}

	estHours := 0.0
	if req.EstimatedHours != nil {
		estHours = *req.EstimatedHours
	}

	status := "design_draft"
	if pmUUID != nil {
		status = "released_to_pm"
	}
	if req.IsAssemblerSelfModified {
		status = "complete"
	}

	relDate := time.Now()
	if req.DateReleasedFromMechDesign != nil && *req.DateReleasedFromMechDesign != "" {
		if t, err := time.Parse(time.RFC3339, *req.DateReleasedFromMechDesign); err == nil {
			relDate = t
		}
	}

	item := models.ReworkItem{
		SalesOrderID:               soUUID,
		MachineID:                  machUUID,
		DefectID:                   defUUID,
		ProjectNumber:              projNum,
		SubAssembly:                req.SubAssembly,
		PartNumber:                 req.PartNumber,
		Description:                req.Description,
		Revision:                   req.Revision,
		Material:                   req.Material,
		Qty:                        req.Qty,
		PartType:                   req.PartType,
		MechDesignerID:             designerUUID,
		DateReleasedFromMechDesign: &relDate,
		PMReleasedToID:             pmUUID,
		PDMVaultReleased:           req.PDMVaultReleased,
		ReasonForRework:            req.ReasonForRework,
		EstimatedHours:             estHours,
		AssemblerID:                asmUUID,
		IsAssemblerSelfModified:    req.IsAssemblerSelfModified,
		Status:                     status,
	}

	created, updatedDef, err := s.repo.CreateReworkItem(ctx, &item)
	if err != nil {
		return nil, err
	}

	return &CreateReworkResult{
		Item:          created,
		UpdatedDefect: updatedDef,
	}, nil
}

func (s *service) UpdateReworkItem(ctx context.Context, id uuid.UUID, req UpdateReworkRequest) (*UpdateReworkResult, error) {
	existing, err := s.repo.GetReworkItemByID(ctx, id)
	if err != nil {
		return nil, ErrReworkNotFound
	}

	if req.ProjectNumber != nil {
		existing.ProjectNumber = *req.ProjectNumber
	}
	if req.SubAssembly != nil {
		existing.SubAssembly = req.SubAssembly
	}
	if req.PartNumber != nil {
		existing.PartNumber = *req.PartNumber
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Revision != nil {
		existing.Revision = *req.Revision
	}
	if req.Material != nil {
		existing.Material = *req.Material
	}
	if req.Qty != nil {
		existing.Qty = *req.Qty
	}
	if req.PartType != nil {
		existing.PartType = *req.PartType
	}
	if req.PDMVaultReleased != nil {
		existing.PDMVaultReleased = *req.PDMVaultReleased
	}
	if req.ReasonForRework != nil {
		existing.ReasonForRework = *req.ReasonForRework
	}
	if req.PMReleasedToID != nil {
		if *req.PMReleasedToID != "" {
			if u, err := uuid.Parse(*req.PMReleasedToID); err == nil {
				existing.PMReleasedToID = &u
			}
		} else {
			existing.PMReleasedToID = nil
		}
	}
	if req.DateReleasedToMfg != nil {
		if *req.DateReleasedToMfg != "" {
			if t, err := time.Parse(time.RFC3339, *req.DateReleasedToMfg); err == nil {
				existing.DateReleasedToMfg = &t
			}
		} else {
			existing.DateReleasedToMfg = nil
		}
	}
	if req.RequestedCompletionDate != nil {
		existing.RequestedCompletionDate = req.RequestedCompletionDate
	}
	if req.PMDeliveredTo != nil {
		existing.PMDeliveredTo = req.PMDeliveredTo
	}
	if req.ExpectedCompletionDate != nil {
		existing.ExpectedCompletionDate = req.ExpectedCompletionDate
	}
	if req.MaterialOrderedDate != nil {
		existing.MaterialOrderedDate = req.MaterialOrderedDate
	}
	if req.AssignedMachinistID != nil {
		if *req.AssignedMachinistID != "" {
			if u, err := uuid.Parse(*req.AssignedMachinistID); err == nil {
				existing.AssignedMachinistID = &u
			}
		} else {
			existing.AssignedMachinistID = nil
		}
	}
	if req.DateMfgCompleted != nil {
		if *req.DateMfgCompleted != "" {
			if t, err := time.Parse(time.RFC3339, *req.DateMfgCompleted); err == nil {
				existing.DateMfgCompleted = &t
			}
		} else {
			existing.DateMfgCompleted = nil
		}
	}
	if req.PartGivenToOrLeftAt != nil {
		existing.PartGivenToOrLeftAt = req.PartGivenToOrLeftAt
	}
	if req.EstimatedHours != nil {
		existing.EstimatedHours = *req.EstimatedHours
	}
	if req.ActualHours != nil {
		existing.ActualHours = *req.ActualHours
	}
	if req.RequiresOutsideProcessing != nil {
		existing.RequiresOutsideProcessing = *req.RequiresOutsideProcessing
	}
	if req.OutsideVendor != nil {
		existing.OutsideVendor = req.OutsideVendor
	}
	if req.DateSentForProcessing != nil {
		existing.DateSentForProcessing = req.DateSentForProcessing
	}
	if req.DateExpectedFromProcessing != nil {
		existing.DateExpectedFromProcessing = req.DateExpectedFromProcessing
	}
	if req.DateReceivedFromProcessing != nil {
		existing.DateReceivedFromProcessing = req.DateReceivedFromProcessing
	}
	if req.KittingDeliveredTo != nil {
		existing.KittingDeliveredTo = req.KittingDeliveredTo
	}
	if req.Status != nil {
		existing.Status = *req.Status
	}
	if req.PartsCollectedByPM != nil {
		existing.PartsCollectedByPM = *req.PartsCollectedByPM
	}
	if req.AssemblerID != nil {
		if *req.AssemblerID != "" {
			if u, err := uuid.Parse(*req.AssemblerID); err == nil {
				existing.AssemblerID = &u
			}
		} else {
			existing.AssemblerID = nil
		}
	}

	if existing.Status == "complete" && existing.CompletedAt == nil {
		now := time.Now()
		existing.CompletedAt = &now
		if req.AuthUserID != "" {
			if u, err := uuid.Parse(req.AuthUserID); err == nil {
				existing.CompletedByID = &u
			}
		}
	}

	updated, updatedDefect, err := s.repo.UpdateReworkItem(ctx, &existing, req.AuthUserID)
	if err != nil {
		return nil, err
	}

	return &UpdateReworkResult{
		Item:          updated,
		UpdatedDefect: updatedDefect,
	}, nil
}

func (s *service) AfterHoursDrop(ctx context.Context, id uuid.UUID, dropLocation string, assemblerSelfMod bool, note string) (models.ReworkItem, error) {
	return s.repo.AfterHoursDrop(ctx, id, dropLocation, assemblerSelfMod, note)
}

func (s *service) DeleteReworkItem(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteReworkItem(ctx, id)
}

func (s *service) GetProjectReworkSummary(ctx context.Context, salesOrderID uuid.UUID) (models.ProjectReworkSummary, error) {
	return s.repo.GetProjectReworkSummary(ctx, salesOrderID)
}

func (s *service) GetMachineFATReadiness(ctx context.Context, machineID uuid.UUID) (models.MachineFATReadinessResponse, error) {
	return s.repo.GetMachineFATReadiness(ctx, machineID)
}

func (s *service) GetControlsSchematics(ctx context.Context, salesOrderID, machineID string) ([]models.ControlsSchematicRework, error) {
	return s.repo.GetControlsSchematics(ctx, salesOrderID, machineID)
}

func (s *service) CreateControlsSchematic(ctx context.Context, req CreateControlsSchematicRequest) (uuid.UUID, error) {
	if req.MachineID == "" || req.SchematicNumber == "" {
		return uuid.Nil, ErrSchematicFieldsRequired
	}

	var redlinedUserID *string
	if req.MasterCopyRedlined && req.AuthUserID != "" {
		redlinedUserID = &req.AuthUserID
	}

	return s.repo.CreateControlsSchematic(ctx, req.SalesOrderID, req.MachineID, req.SchematicNumber, req.MasterCopyRedlined, redlinedUserID, req.RedlinesDescription)
}

func (s *service) UpdateControlsSchematic(ctx context.Context, req UpdateControlsSchematicRequest) error {
	return s.repo.UpdateControlsSchematic(ctx, req.ID, req.MasterCopyRedlined, req.SchematicsDigitallyUpdated, req.ChecklistSignedOff, req.RedlinesDescription, req.AuthUserID)
}
