package conc

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

type mockRepository struct {
	totals                 RawTotals
	deptRollup             []RawDepartmentRollup
	machineRollup          []RawMachineRollup
	machineInfo            MachineInfo
	machineTotals          RawTotals
	machineDeptRollup      []RawDepartmentRollup
	reworkItems            []RawReworkItem
	defectItems            []RawDefectItem
	err                    error
}

func (m *mockRepository) GetSummaryTotals(ctx context.Context, baseFilter string, args []interface{}) (RawTotals, error) {
	return m.totals, m.err
}

func (m *mockRepository) GetSummaryDepartmentRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawDepartmentRollup, error) {
	return m.deptRollup, m.err
}

func (m *mockRepository) GetSummaryMachineRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawMachineRollup, error) {
	return m.machineRollup, m.err
}

func (m *mockRepository) GetMachineInfo(ctx context.Context, machineID uuid.UUID) (MachineInfo, error) {
	return m.machineInfo, m.err
}

func (m *mockRepository) GetMachineTotals(ctx context.Context, machineID uuid.UUID) (RawTotals, error) {
	return m.machineTotals, m.err
}

func (m *mockRepository) GetMachineDepartmentRollup(ctx context.Context, machineID uuid.UUID) ([]RawDepartmentRollup, error) {
	return m.machineDeptRollup, m.err
}

func (m *mockRepository) GetMachineReworkItems(ctx context.Context, machineID uuid.UUID) ([]RawReworkItem, error) {
	return m.reworkItems, m.err
}

func (m *mockRepository) GetMachineDefectItems(ctx context.Context, machineID uuid.UUID) ([]RawDefectItem, error) {
	return m.defectItems, m.err
}

func TestService_GetSummary_Calculations(t *testing.T) {
	mock := &mockRepository{
		totals: RawTotals{
			ProductionHours: 100.0,
			ReworkHours:     15.5,
			DefectHours:     4.5,
			NCRHours:        5.0,
			CoNCHours:       25.0,
		},
		deptRollup: []RawDepartmentRollup{
			{
				Department:      "assembly",
				TotalHours:      50.0,
				ProductionHours: 40.0,
				CoNCHours:       10.0,
			},
		},
	}

	svc := NewService(mock)
	resp, err := svc.GetSummary(context.Background(), 100.0, "", "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.HourlyRate != 100.0 {
		t.Errorf("expected hourly rate 100.0, got %v", resp.HourlyRate)
	}

	// 25 conc hours * 100 = 2500
	if resp.TotalCoNCCost != 2500.0 {
		t.Errorf("expected CoNC cost 2500.0, got %v", resp.TotalCoNCCost)
	}

	// Total labor = 100 prod + 25 conc = 125. CoNC % = (25 / 125) * 100 = 20%
	if resp.CoNCPercentageOfLabor != 20.0 {
		t.Errorf("expected CoNC percentage 20.0, got %v", resp.CoNCPercentageOfLabor)
	}

	if len(resp.DepartmentBreakdown) != 1 {
		t.Fatalf("expected 1 department breakdown, got %d", len(resp.DepartmentBreakdown))
	}
	// Dept CoNC % = (10 / 50) * 100 = 20%
	if resp.DepartmentBreakdown[0].CoNCPercentage != 20.0 {
		t.Errorf("expected dept CoNC percentage 20.0, got %v", resp.DepartmentBreakdown[0].CoNCPercentage)
	}
}

func TestService_GetMachineDetail_Calculations(t *testing.T) {
	machID := uuid.New()
	mock := &mockRepository{
		machineInfo: MachineInfo{
			OrderNumber:  "M-100",
			ModelType:    "Feeder",
			ProjectName:  "Test Proj",
			CustomerName: "Customer A",
		},
		machineTotals: RawTotals{
			ProductionHours: 80.0,
			ReworkHours:     10.0,
			DefectHours:     10.0,
			CoNCHours:       20.0,
		},
		reworkItems: []RawReworkItem{
			{
				ID:          uuid.New(),
				PartNumber:  "P-1",
				ActualHours: 10.0,
			},
		},
	}

	svc := NewService(mock)
	detail, err := svc.GetMachineDetail(context.Background(), machID, 90.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if detail.OrderNumber != "M-100" {
		t.Errorf("expected M-100, got %s", detail.OrderNumber)
	}
	if detail.TotalCoNCCost != 1800.0 { // 20 * 90
		t.Errorf("expected total CoNC cost 1800.0, got %v", detail.TotalCoNCCost)
	}
	if len(detail.ReworkItems) != 1 || detail.ReworkItems[0].Cost != 900.0 { // 10 * 90
		t.Errorf("expected rework item cost 900.0, got %+v", detail.ReworkItems)
	}
}
