package assemblies

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrAssemblyNotFound   = errors.New("assembly not found")
	ErrInvalidAssemblyCode = errors.New("assembly code is required")
	ErrInvalidMachineID   = errors.New("machine ID is required")
	ErrCircularDependency = errors.New("circular assembly hierarchy dependency detected")
)

type CreateAssemblyRequest struct {
	MachineID        uuid.UUID  `json:"machine_id"`
	ParentAssemblyID *uuid.UUID `json:"parent_assembly_id,omitempty"`
	AssemblyCode     string     `json:"assembly_code"`
	Name             string     `json:"name"`
	Description      string     `json:"description,omitempty"`
	DrawingNumber    string     `json:"drawing_number,omitempty"`
	Revision         string     `json:"revision,omitempty"`
	Department       string     `json:"department,omitempty"`
	QuotedHours      float64    `json:"quoted_hours,omitempty"`
	Status           string     `json:"status,omitempty"`
	SequenceOrder    int        `json:"sequence_order,omitempty"`
}

type UpdateAssemblyRequest struct {
	ParentAssemblyID *uuid.UUID `json:"parent_assembly_id,omitempty"`
	AssemblyCode     *string    `json:"assembly_code,omitempty"`
	Name             *string    `json:"name,omitempty"`
	Description      *string    `json:"description,omitempty"`
	DrawingNumber    *string    `json:"drawing_number,omitempty"`
	Revision         *string    `json:"revision,omitempty"`
	Department       *string    `json:"department,omitempty"`
	QuotedHours      *float64   `json:"quoted_hours,omitempty"`
	Status           *string    `json:"status,omitempty"`
	SequenceOrder    *int       `json:"sequence_order,omitempty"`
}

type Service interface {
	GetAssemblyTree(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error)
	GetAssemblyList(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error)
	GetAssemblyByID(ctx context.Context, id uuid.UUID) (*models.MachineAssembly, error)
	CreateAssembly(ctx context.Context, req CreateAssemblyRequest) (*models.MachineAssembly, error)
	UpdateAssembly(ctx context.Context, id uuid.UUID, req UpdateAssemblyRequest) (*models.MachineAssembly, error)
	DeleteAssembly(ctx context.Context, id uuid.UUID) error
	PreviewBOMImport(ctx context.Context, machineID uuid.UUID, r io.Reader) (*models.BOMValidationReport, []models.ParsedBOMNode, error)
	CommitBOMImport(ctx context.Context, machineID uuid.UUID, nodes []models.ParsedBOMNode) error
	AddPart(ctx context.Context, p *models.KittingPart) error
	UpdatePartPick(ctx context.Context, partID uuid.UUID, qtyPicked int, fulfilledBy string) (*models.KittingPart, error)
}

type service struct {
	repo     Repository
	importer BOMImporter
}

func NewService(repo Repository, importer BOMImporter) Service {
	if importer == nil {
		importer = NewGenericCSVBOMImporter()
	}
	return &service{
		repo:     repo,
		importer: importer,
	}
}

func (s *service) GetAssemblyTree(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	if machineID == uuid.Nil {
		return nil, ErrInvalidMachineID
	}
	return s.repo.GetAssemblyTree(ctx, machineID)
}

func (s *service) GetAssemblyList(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	if machineID == uuid.Nil {
		return nil, ErrInvalidMachineID
	}
	return s.repo.GetAssemblyList(ctx, machineID)
}

func (s *service) GetAssemblyByID(ctx context.Context, id uuid.UUID) (*models.MachineAssembly, error) {
	if id == uuid.Nil {
		return nil, errors.New("invalid assembly ID")
	}
	asm, err := s.repo.GetAssemblyByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if asm == nil {
		return nil, ErrAssemblyNotFound
	}
	return asm, nil
}

func (s *service) CreateAssembly(ctx context.Context, req CreateAssemblyRequest) (*models.MachineAssembly, error) {
	if req.MachineID == uuid.Nil {
		return nil, ErrInvalidMachineID
	}
	if strings.TrimSpace(req.AssemblyCode) == "" {
		return nil, ErrInvalidAssemblyCode
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = req.AssemblyCode
	}
	if req.Revision == "" {
		req.Revision = "A"
	}
	if req.Department == "" {
		req.Department = "assembly"
	}
	status := models.AssemblyStatusDesignDraft
	if req.Status != "" {
		status = models.AssemblyStatus(req.Status)
	}

	asm := &models.MachineAssembly{
		ID:               uuid.New(),
		MachineID:        req.MachineID,
		ParentAssemblyID: req.ParentAssemblyID,
		AssemblyCode:     strings.TrimSpace(req.AssemblyCode),
		Name:             strings.TrimSpace(req.Name),
		Description:      strings.TrimSpace(req.Description),
		DrawingNumber:    strings.TrimSpace(req.DrawingNumber),
		Revision:         strings.TrimSpace(req.Revision),
		Department:       req.Department,
		QuotedHours:      req.QuotedHours,
		Status:           status,
		SequenceOrder:    req.SequenceOrder,
		SubAssemblies:    []models.MachineAssembly{},
		Parts:            []models.KittingPart{},
	}

	if err := s.repo.CreateAssembly(ctx, asm); err != nil {
		return nil, err
	}
	return asm, nil
}

func (s *service) UpdateAssembly(ctx context.Context, id uuid.UUID, req UpdateAssemblyRequest) (*models.MachineAssembly, error) {
	asm, err := s.repo.GetAssemblyByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if asm == nil {
		return nil, ErrAssemblyNotFound
	}

	if req.ParentAssemblyID != nil {
		if *req.ParentAssemblyID == id {
			return nil, ErrCircularDependency
		}
		asm.ParentAssemblyID = req.ParentAssemblyID
	}
	if req.AssemblyCode != nil && strings.TrimSpace(*req.AssemblyCode) != "" {
		asm.AssemblyCode = strings.TrimSpace(*req.AssemblyCode)
	}
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		asm.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		asm.Description = strings.TrimSpace(*req.Description)
	}
	if req.DrawingNumber != nil {
		asm.DrawingNumber = strings.TrimSpace(*req.DrawingNumber)
	}
	if req.Revision != nil && strings.TrimSpace(*req.Revision) != "" {
		asm.Revision = strings.TrimSpace(*req.Revision)
	}
	if req.Department != nil && strings.TrimSpace(*req.Department) != "" {
		asm.Department = strings.TrimSpace(*req.Department)
	}
	if req.QuotedHours != nil && *req.QuotedHours >= 0 {
		asm.QuotedHours = *req.QuotedHours
	}
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		asm.Status = models.AssemblyStatus(*req.Status)
	}
	if req.SequenceOrder != nil {
		asm.SequenceOrder = *req.SequenceOrder
	}

	if err := s.repo.UpdateAssembly(ctx, asm); err != nil {
		return nil, err
	}
	return asm, nil
}

func (s *service) DeleteAssembly(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteAssembly(ctx, id)
}

func (s *service) PreviewBOMImport(ctx context.Context, machineID uuid.UUID, r io.Reader) (*models.BOMValidationReport, []models.ParsedBOMNode, error) {
	if machineID == uuid.Nil {
		return nil, nil, ErrInvalidMachineID
	}
	nodes, err := s.importer.Parse(r, machineID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse BOM: %w", err)
	}
	report, err := s.importer.Validate(nodes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to validate BOM: %w", err)
	}
	return report, nodes, nil
}

func (s *service) CommitBOMImport(ctx context.Context, machineID uuid.UUID, nodes []models.ParsedBOMNode) error {
	if machineID == uuid.Nil {
		return ErrInvalidMachineID
	}
	if len(nodes) == 0 {
		return errors.New("cannot import empty BOM")
	}
	report, err := s.importer.Validate(nodes)
	if err != nil {
		return err
	}
	if !report.IsValid {
		return fmt.Errorf("cannot commit invalid BOM: %d validation errors found", len(report.Errors))
	}
	return s.repo.BatchInsert(ctx, machineID, nodes)
}

func (s *service) AddPart(ctx context.Context, p *models.KittingPart) error {
	if p.MachineID == uuid.Nil {
		return ErrInvalidMachineID
	}
	if p.AssemblyID == nil || *p.AssemblyID == uuid.Nil {
		return errors.New("assembly ID is required for kitting part")
	}
	if strings.TrimSpace(p.PartNumber) == "" {
		return errors.New("part number is required")
	}
	if p.QtyRequired <= 0 {
		p.QtyRequired = 1
	}
	return s.repo.AddPartToAssembly(ctx, p)
}

func (s *service) UpdatePartPick(ctx context.Context, partID uuid.UUID, qtyPicked int, fulfilledBy string) (*models.KittingPart, error) {
	if partID == uuid.Nil {
		return nil, errors.New("invalid part ID")
	}
	if qtyPicked < 0 {
		qtyPicked = 0
	}
	return s.repo.UpdateKittingPartPick(ctx, partID, qtyPicked, fulfilledBy)
}
