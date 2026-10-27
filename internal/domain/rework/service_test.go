package rework

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

type mockReworkRepository struct {
	items         []models.ReworkItem
	item          models.ReworkItem
	updatedDefect *models.Defect
	summary       models.ProjectReworkSummary
	fatReadiness  models.MachineFATReadinessResponse
	schematics    []models.ControlsSchematicRework
	schematicID   uuid.UUID
	resolvedSOID  string
	projNumber    string
	err           error
}

func (m *mockReworkRepository) GetReworkItems(ctx context.Context, salesOrderID, machineID, status, view, partType string) ([]models.ReworkItem, error) {
	return m.items, m.err
}

func (m *mockReworkRepository) GetReworkItemByID(ctx context.Context, id uuid.UUID) (models.ReworkItem, error) {
	return m.item, m.err
}

func (m *mockReworkRepository) CreateReworkItem(ctx context.Context, item *models.ReworkItem) (models.ReworkItem, *models.Defect, error) {
	return m.item, m.updatedDefect, m.err
}

func (m *mockReworkRepository) UpdateReworkItem(ctx context.Context, item *models.ReworkItem, authUserID string) (models.ReworkItem, *models.Defect, error) {
	return m.item, m.updatedDefect, m.err
}

func (m *mockReworkRepository) AfterHoursDrop(ctx context.Context, id uuid.UUID, location string, isAssemblerSelfMod bool, note string) (models.ReworkItem, error) {
	return m.item, m.err
}

func (m *mockReworkRepository) DeleteReworkItem(ctx context.Context, id uuid.UUID) error {
	return m.err
}

func (m *mockReworkRepository) GetProjectReworkSummary(ctx context.Context, salesOrderID uuid.UUID) (models.ProjectReworkSummary, error) {
	return m.summary, m.err
}

func (m *mockReworkRepository) GetMachineFATReadiness(ctx context.Context, machineID uuid.UUID) (models.MachineFATReadinessResponse, error) {
	return m.fatReadiness, m.err
}

func (m *mockReworkRepository) GetControlsSchematics(ctx context.Context, salesOrderID, machineID string) ([]models.ControlsSchematicRework, error) {
	return m.schematics, m.err
}

func (m *mockReworkRepository) CreateControlsSchematic(ctx context.Context, salesOrderID, machineID, schematicNumber string, masterCopyRedlined bool, redlinedUserID *string, redlinesDescription *string) (uuid.UUID, error) {
	return m.schematicID, m.err
}

func (m *mockReworkRepository) UpdateControlsSchematic(ctx context.Context, id string, masterCopyRedlined, schematicsDigitallyUpdated, checklistSignedOff *bool, redlinesDescription *string, authUserID string) error {
	return m.err
}

func (m *mockReworkRepository) ResolveSalesOrderID(ctx context.Context, soID, machineID, defectID *string) (string, error) {
	return m.resolvedSOID, m.err
}

func (m *mockReworkRepository) GetProjectNumberForSO(ctx context.Context, soID string) (string, error) {
	return m.projNumber, m.err
}

func TestReworkService_CreateReworkItem_Validation(t *testing.T) {
	svc := NewService(&mockReworkRepository{})

	// Missing required fields
	_, err := svc.CreateReworkItem(context.Background(), CreateReworkRequest{})
	if err != ErrRequiredFields {
		t.Fatalf("expected ErrRequiredFields, got %v", err)
	}

	// Invalid part type
	_, err = svc.CreateReworkItem(context.Background(), CreateReworkRequest{
		PartNumber:  "PN-1",
		Description: "Bracket",
		Revision:    "A",
		Material:    "Steel",
		PartType:    "INVALID",
	})
	if err != ErrInvalidPartType {
		t.Fatalf("expected ErrInvalidPartType, got %v", err)
	}

	// Missing sales order ID
	_, err = svc.CreateReworkItem(context.Background(), CreateReworkRequest{
		PartNumber:  "PN-1",
		Description: "Bracket",
		Revision:    "A",
		Material:    "Steel",
		PartType:    "NEW",
	})
	if err != ErrSalesOrderRequired {
		t.Fatalf("expected ErrSalesOrderRequired, got %v", err)
	}
}

func TestReworkService_FATReadiness_Blockers(t *testing.T) {
	machID := uuid.New()
	mock := &mockReworkRepository{
		fatReadiness: models.MachineFATReadinessResponse{
			MachineID:    machID,
			CanProceed:   false,
			OpenIssues:   2,
			OpenNCRs:     1,
			ActiveRework: 1,
			Blockers:     []string{"Blocker 1", "Blocker 2"},
		},
	}

	svc := NewService(mock)
	resp, err := svc.GetMachineFATReadiness(context.Background(), machID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.CanProceed {
		t.Errorf("expected CanProceed to be false when blockers exist")
	}
	if len(resp.Blockers) != 2 {
		t.Errorf("expected 2 blockers, got %d", len(resp.Blockers))
	}
}
