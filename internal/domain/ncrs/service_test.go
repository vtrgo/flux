package ncrs

import (
	"context"
	"strings"
	"testing"

	"github.com/vtrgo/flux/internal/models"
)

type mockNCRRepository struct {
	nextNumber      string
	ncrs            []models.NCRDetail
	signatureUser   string
	assignedUser    string
	createResult    *CreateNCRResult
	updateResult    *UpdateNCRResult
	err             error
}

func (m *mockNCRRepository) GenerateNextNCRNumber(ctx context.Context) (string, error) {
	return m.nextNumber, m.err
}

func (m *mockNCRRepository) GetNCRs(ctx context.Context, search, status, machineID string) ([]models.NCRDetail, error) {
	return m.ncrs, m.err
}

func (m *mockNCRRepository) FindUserBySignature(ctx context.Context, signature string) (string, error) {
	return m.signatureUser, m.err
}

func (m *mockNCRRepository) FindDefectAssignedUserID(ctx context.Context, defectID string) (string, error) {
	return m.assignedUser, m.err
}

func (m *mockNCRRepository) CreateNCR(ctx context.Context, params CreateNCRParams) (*CreateNCRResult, error) {
	return m.createResult, m.err
}

func (m *mockNCRRepository) UpdateNCR(ctx context.Context, params UpdateNCRParams) (*UpdateNCRResult, error) {
	return m.updateResult, m.err
}

func TestNCRService_CreateNCR_Validation(t *testing.T) {
	svc := NewService(&mockNCRRepository{nextNumber: "NCR-2026-001"})

	// Missing machine ID
	_, err := svc.CreateNCR(context.Background(), CreateNCRRequest{})
	if err != ErrMachineRequired {
		t.Fatalf("expected ErrMachineRequired, got %v", err)
	}

	// Missing Assembler
	_, err = svc.CreateNCR(context.Background(), CreateNCRRequest{MachineID: "m-1"})
	if err != ErrAssemblerRequired {
		t.Fatalf("expected ErrAssemblerRequired, got %v", err)
	}

	// Missing Location
	_, err = svc.CreateNCR(context.Background(), CreateNCRRequest{MachineID: "m-1", Assembler: "Bob"})
	if err != ErrLocationRequired {
		t.Fatalf("expected ErrLocationRequired, got %v", err)
	}

	// Missing Description
	_, err = svc.CreateNCR(context.Background(), CreateNCRRequest{MachineID: "m-1", Assembler: "Bob", Location: "Shop"})
	if err != ErrDescriptionRequired {
		t.Fatalf("expected ErrDescriptionRequired, got %v", err)
	}

	// Description too long (> 4000)
	longDesc := strings.Repeat("A", 4001)
	_, err = svc.CreateNCR(context.Background(), CreateNCRRequest{
		MachineID:   "m-1",
		Assembler:   "Bob",
		Location:    "Shop",
		Description: longDesc,
	})
	if err != ErrDescriptionTooLong {
		t.Fatalf("expected ErrDescriptionTooLong, got %v", err)
	}
}

func TestNCRService_CreateNCR_SignatureResolution(t *testing.T) {
	mock := &mockNCRRepository{
		nextNumber:    "NCR-2026-001",
		signatureUser: "user-123",
		createResult: &CreateNCRResult{
			NCR: models.NCRDetail{
				Defect: models.Defect{
					Description: "Test NCR",
				},
			},
		},
	}

	svc := NewService(mock)
	sig := "Lead Signature"
	res, err := svc.CreateNCR(context.Background(), CreateNCRRequest{
		MachineID:         "m-1",
		Assembler:         "Bob",
		Location:          "Shop",
		Description:       "Test NCR",
		TeamLeadSignature: &sig,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.NCR.Description != "Test NCR" {
		t.Errorf("expected Test NCR, got %s", res.NCR.Description)
	}
}
