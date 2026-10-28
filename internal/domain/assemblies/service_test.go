package assemblies

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

type mockRepo struct {
	assemblies map[uuid.UUID]*models.MachineAssembly
	parts      map[uuid.UUID]*models.KittingPart
}

func newMockRepo() *mockRepo {
	return &mockRepo{
		assemblies: make(map[uuid.UUID]*models.MachineAssembly),
		parts:      make(map[uuid.UUID]*models.KittingPart),
	}
}

func (m *mockRepo) GetAssemblyTree(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	var roots []models.MachineAssembly
	for _, a := range m.assemblies {
		if a.MachineID == machineID && a.ParentAssemblyID == nil {
			roots = append(roots, *a)
		}
	}
	return roots, nil
}

func (m *mockRepo) GetAssemblyList(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	var list []models.MachineAssembly
	for _, a := range m.assemblies {
		if a.MachineID == machineID {
			list = append(list, *a)
		}
	}
	return list, nil
}

func (m *mockRepo) GetAssemblyByID(ctx context.Context, id uuid.UUID) (*models.MachineAssembly, error) {
	if a, ok := m.assemblies[id]; ok {
		return a, nil
	}
	return nil, nil
}

func (m *mockRepo) CreateAssembly(ctx context.Context, a *models.MachineAssembly) error {
	m.assemblies[a.ID] = a
	return nil
}

func (m *mockRepo) UpdateAssembly(ctx context.Context, a *models.MachineAssembly) error {
	m.assemblies[a.ID] = a
	return nil
}

func (m *mockRepo) DeleteAssembly(ctx context.Context, id uuid.UUID) error {
	delete(m.assemblies, id)
	return nil
}

func (m *mockRepo) BatchInsert(ctx context.Context, machineID uuid.UUID, nodes []models.ParsedBOMNode) error {
	for _, n := range nodes {
		id := uuid.New()
		m.assemblies[id] = &models.MachineAssembly{
			ID:           id,
			MachineID:    machineID,
			AssemblyCode: n.AssemblyCode,
			Name:         n.Name,
		}
	}
	return nil
}

func (m *mockRepo) GetKittingPartsForAssembly(ctx context.Context, assemblyID uuid.UUID) ([]models.KittingPart, error) {
	var parts []models.KittingPart
	for _, p := range m.parts {
		if p.AssemblyID != nil && *p.AssemblyID == assemblyID {
			parts = append(parts, *p)
		}
	}
	return parts, nil
}

func (m *mockRepo) AddPartToAssembly(ctx context.Context, p *models.KittingPart) error {
	m.parts[p.ID] = p
	return nil
}

func (m *mockRepo) UpdateKittingPartPick(ctx context.Context, partID uuid.UUID, qtyPicked int, fulfilledBy string) (*models.KittingPart, error) {
	if p, ok := m.parts[partID]; ok {
		p.QtyPicked = qtyPicked
		return p, nil
	}
	return nil, ErrAssemblyNotFound
}

func (m *mockRepo) FulfillTote(ctx context.Context, assemblyID uuid.UUID, fulfilledBy string) (*models.MachineAssembly, error) {
	if a, ok := m.assemblies[assemblyID]; ok {
		a.Status = models.AssemblyStatusKitted
		return a, nil
	}
	return nil, ErrAssemblyNotFound
}

func TestService_CreateAndValidate(t *testing.T) {
	repo := newMockRepo()
	svc := NewService(repo, nil)
	ctx := context.Background()

	machineID := uuid.New()

	// 1. Missing Machine ID
	_, err := svc.CreateAssembly(ctx, CreateAssemblyRequest{
		AssemblyCode: "ASM-01",
		Name:         "Main Drive",
	})
	if err != ErrInvalidMachineID {
		t.Fatalf("expected ErrInvalidMachineID, got %v", err)
	}

	// 2. Missing Code
	_, err = svc.CreateAssembly(ctx, CreateAssemblyRequest{
		MachineID: machineID,
		Name:      "Main Drive",
	})
	if err != ErrInvalidAssemblyCode {
		t.Fatalf("expected ErrInvalidAssemblyCode, got %v", err)
	}

	// 3. Success
	asm, err := svc.CreateAssembly(ctx, CreateAssemblyRequest{
		MachineID:    machineID,
		AssemblyCode: "ASM-01",
		Name:         "Main Drive Unit",
		QuotedHours:  16.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if asm.AssemblyCode != "ASM-01" || asm.Status != models.AssemblyStatusDesignDraft {
		t.Fatalf("unexpected assembly state: %+v", asm)
	}

	// 4. Circular dependency check on update
	_, err = svc.UpdateAssembly(ctx, asm.ID, UpdateAssemblyRequest{
		ParentAssemblyID: &asm.ID,
	})
	if err != ErrCircularDependency {
		t.Fatalf("expected ErrCircularDependency, got %v", err)
	}
}

func TestGenericCSVBOMImporter_ParseAndValidate(t *testing.T) {
	csvData := `AssemblyCode,ParentCode,Name,DrawingNumber,Rev,QuotedHours,PartNumber,PartDescription,Qty
ASM-01,,Main Drive Assembly,VTR-1024-D01,B,16.0,,,
SUB-01A,ASM-01,Motor Mount,VTR-1024-D01-1,A,4.0,MTR-100,10HP AC Motor,1
SUB-01A,ASM-01,Motor Mount,VTR-1024-D01-1,A,4.0,HSG-450,Cast Iron Housing,1
SUB-01B,ASM-01,Reduction Gearbox,VTR-1024-D01-2,A,6.0,GBX-010,Planetary Gear,1
`
	importer := NewGenericCSVBOMImporter()
	nodes, err := importer.Parse(strings.NewReader(csvData), uuid.New())
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	if len(nodes) != 3 {
		t.Fatalf("expected 3 assembly nodes, got %d", len(nodes))
	}

	// Node SUB-01A should have 2 parts
	var sub01A *models.ParsedBOMNode
	for i := range nodes {
		if nodes[i].AssemblyCode == "SUB-01A" {
			sub01A = &nodes[i]
			break
		}
	}
	if sub01A == nil {
		t.Fatalf("SUB-01A not found")
	}
	if len(sub01A.Parts) != 2 {
		t.Fatalf("expected 2 parts for SUB-01A, got %d", len(sub01A.Parts))
	}

	report, err := importer.Validate(nodes)
	if err != nil {
		t.Fatalf("validation error: %v", err)
	}
	if !report.IsValid {
		t.Fatalf("expected valid BOM report, got errors: %+v", report.Errors)
	}
	if len(report.PreviewTree) != 1 {
		t.Fatalf("expected 1 root node in preview tree, got %d", len(report.PreviewTree))
	}
	if len(report.PreviewTree[0].SubAssemblies) != 2 {
		t.Fatalf("expected 2 sub-assemblies under ASM-01, got %d", len(report.PreviewTree[0].SubAssemblies))
	}
}

func TestGenericCSVBOMImporter_CycleDetection(t *testing.T) {
	// Circular: A -> B -> A
	nodes := []models.ParsedBOMNode{
		{AssemblyCode: "ASM-A", ParentCode: "ASM-B", Name: "Node A"},
		{AssemblyCode: "ASM-B", ParentCode: "ASM-A", Name: "Node B"},
	}

	importer := NewGenericCSVBOMImporter()
	report, err := importer.Validate(nodes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if report.IsValid {
		t.Fatalf("expected circular dependency detection failure")
	}
	foundCycleError := false
	for _, e := range report.Errors {
		if strings.Contains(e.Message, "Circular dependency") {
			foundCycleError = true
			break
		}
	}
	if !foundCycleError {
		t.Fatalf("expected circular dependency error message in report: %+v", report.Errors)
	}
}
