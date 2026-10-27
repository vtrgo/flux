package ncrs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrMachineRequired     = errors.New("Machine ID is required")
	ErrAssemblerRequired   = errors.New("Assembler name is required")
	ErrLocationRequired    = errors.New("Location of non-conformance is required")
	ErrDescriptionRequired = errors.New("Description of defect is required")
	ErrDescriptionTooLong  = errors.New("Description exceeds maximum length of 4000 characters")
	ErrNCRIDRequired       = errors.New("NCR ID is required")
)

// CreateNCRRequest holds incoming HTTP payload to create an NCR
type CreateNCRRequest struct {
	MachineID           string
	NCRNumber           *string
	Assembler           string
	Location            string
	Description         string
	Severity            string
	SourceDepartment    string
	AssignedDepartment  string
	AssignedUserID      *string
	AuthUserID          string
	Notes               *string
	DueDate             *time.Time
	CloseoutDate        *time.Time
	RootCause           *string
	CorrectiveAction    *string
	TeamLeadSignature   *string
	SendNotification    bool
	UpgradeFromDefectID *string
	AttachmentsDir      string
}

// UpdateNCRRequest holds incoming HTTP payload to update an NCR
type UpdateNCRRequest struct {
	NCRID              string
	Assembler          *string
	Location           *string
	Description        *string
	Severity           *string
	Notes              *string
	AssignedDepartment *string
	AssignedUserID     *string
	DueDate            *time.Time
	RootCause          *string
	CorrectiveAction   *string
	CloseoutDate       *time.Time
	TeamLeadSignature  *string
	Status             *string
	AuthUserID         string
	SendNotification   bool
}

// Service defines domain operations for NCRs
type Service interface {
	GetNextNumber(ctx context.Context) (string, error)
	ListNCRs(ctx context.Context, search, status, machineID string) ([]models.NCRDetail, error)
	CreateNCR(ctx context.Context, req CreateNCRRequest) (*CreateNCRResult, error)
	UpdateNCR(ctx context.Context, req UpdateNCRRequest) (*UpdateNCRResult, error)
}

type service struct {
	repo Repository
}

// NewService creates a new NCR domain service
func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetNextNumber(ctx context.Context) (string, error) {
	return s.repo.GenerateNextNCRNumber(ctx)
}

func (s *service) ListNCRs(ctx context.Context, search, status, machineID string) ([]models.NCRDetail, error) {
	return s.repo.GetNCRs(ctx, search, status, machineID)
}

func (s *service) CreateNCR(ctx context.Context, req CreateNCRRequest) (*CreateNCRResult, error) {
	if strings.TrimSpace(req.MachineID) == "" {
		return nil, ErrMachineRequired
	}
	if strings.TrimSpace(req.Assembler) == "" {
		return nil, ErrAssemblerRequired
	}
	if strings.TrimSpace(req.Location) == "" {
		return nil, ErrLocationRequired
	}
	if strings.TrimSpace(req.Description) == "" {
		return nil, ErrDescriptionRequired
	}
	if len(req.Description) > 4000 {
		return nil, ErrDescriptionTooLong
	}

	sourceDept := req.SourceDepartment
	if sourceDept == "" {
		sourceDept = "quality"
	}
	assignedDept := req.AssignedDepartment
	if assignedDept == "" {
		assignedDept = "assembly"
	}
	severity := req.Severity
	if severity == "" {
		severity = "moderate"
	}

	ncrNumber := req.NCRNumber
	if ncrNumber == nil || *ncrNumber == "" {
		genNum, err := s.repo.GenerateNextNCRNumber(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to generate NCR number: %w", err)
		}
		ncrNumber = &genNum
	}

	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	} else if req.TeamLeadSignature != nil && strings.TrimSpace(*req.TeamLeadSignature) != "" {
		sig := strings.TrimSpace(*req.TeamLeadSignature)
		if matchedID, err := s.repo.FindUserBySignature(ctx, sig); err == nil && matchedID != "" {
			assignedUserID = matchedID
		}
	} else if req.UpgradeFromDefectID != nil && strings.TrimSpace(*req.UpgradeFromDefectID) != "" {
		if origID, err := s.repo.FindDefectAssignedUserID(ctx, strings.TrimSpace(*req.UpgradeFromDefectID)); err == nil && origID != "" {
			assignedUserID = origID
		}
	}

	var notesVal string
	if req.Notes != nil {
		notesVal = *req.Notes
	}

	params := CreateNCRParams{
		MachineID:           req.MachineID,
		NCRNumber:           ncrNumber,
		Assembler:           req.Assembler,
		Location:            req.Location,
		Description:         req.Description,
		Severity:            severity,
		SourceDepartment:    sourceDept,
		AssignedDepartment:  assignedDept,
		AssignedUserID:      assignedUserID,
		AuthUserID:          req.AuthUserID,
		Notes:               notesVal,
		DueDate:             req.DueDate,
		CloseoutDate:        req.CloseoutDate,
		RootCause:           req.RootCause,
		CorrectiveAction:    req.CorrectiveAction,
		TeamLeadSignature:   req.TeamLeadSignature,
		UpgradeFromDefectID: req.UpgradeFromDefectID,
		AttachmentsDir:      req.AttachmentsDir,
	}

	return s.repo.CreateNCR(ctx, params)
}

func (s *service) UpdateNCR(ctx context.Context, req UpdateNCRRequest) (*UpdateNCRResult, error) {
	if strings.TrimSpace(req.NCRID) == "" {
		return nil, ErrNCRIDRequired
	}
	if req.Description != nil && len(*req.Description) > 4000 {
		return nil, ErrDescriptionTooLong
	}

	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	} else if req.TeamLeadSignature != nil && strings.TrimSpace(*req.TeamLeadSignature) != "" {
		sig := strings.TrimSpace(*req.TeamLeadSignature)
		if matchedID, err := s.repo.FindUserBySignature(ctx, sig); err == nil && matchedID != "" {
			assignedUserID = matchedID
		}
	}

	params := UpdateNCRParams{
		NCRID:              req.NCRID,
		Assembler:          req.Assembler,
		Location:           req.Location,
		Description:        req.Description,
		Severity:           req.Severity,
		Notes:              req.Notes,
		AssignedDepartment: req.AssignedDepartment,
		AssignedUserID:     assignedUserID,
		DueDate:            req.DueDate,
		RootCause:          req.RootCause,
		CorrectiveAction:   req.CorrectiveAction,
		CloseoutDate:       req.CloseoutDate,
		TeamLeadSignature:  req.TeamLeadSignature,
		Status:             req.Status,
		AuthUserID:         req.AuthUserID,
	}

	return s.repo.UpdateNCR(ctx, params)
}
