package conc

import (
	"context"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

const DefaultBurdenHourlyRate = 85.00

// Round2 rounds a float64 to two decimal places
func Round2(val float64) float64 {
	return math.Round(val*100) / 100
}

// Service defines business operations for Cost of Non-Conformance
type Service interface {
	GetSummary(ctx context.Context, hourlyRate float64, salesOrderID, startDate, endDate string) (*models.CoNCSummaryResponse, error)
	GetMachineDetail(ctx context.Context, machineID uuid.UUID, hourlyRate float64) (*models.CoNCMachineDetailResponse, error)
}

type service struct {
	repo Repository
}

// NewService creates a new CoNC domain service
func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetSummary(ctx context.Context, hourlyRate float64, salesOrderID, startDate, endDate string) (*models.CoNCSummaryResponse, error) {
	if hourlyRate <= 0 {
		hourlyRate = DefaultBurdenHourlyRate
	}

	baseFilter := "WHERE 1=1"
	var args []interface{}
	argIdx := 1

	if salesOrderID != "" {
		baseFilter += fmt.Sprintf(" AND (m.sales_order_id = $%d OR rw.sales_order_id = $%d)", argIdx, argIdx)
		args = append(args, salesOrderID)
		argIdx++
	}
	if startDate != "" {
		baseFilter += fmt.Sprintf(" AND te.work_date >= $%d::date", argIdx)
		args = append(args, startDate)
		argIdx++
	}
	if endDate != "" {
		baseFilter += fmt.Sprintf(" AND te.work_date <= $%d::date", argIdx)
		args = append(args, endDate)
		argIdx++
	}

	totals, err := s.repo.GetSummaryTotals(ctx, baseFilter, args)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch totals: %w", err)
	}

	resp := &models.CoNCSummaryResponse{
		HourlyRate:           hourlyRate,
		TotalProductionHours: totals.ProductionHours,
		TotalReworkHours:     totals.ReworkHours,
		TotalDefectHours:     totals.DefectHours,
		TotalNCRHours:        totals.NCRHours,
		TotalCoNCHours:       totals.CoNCHours,
		ReworkCost:           Round2(totals.ReworkHours * hourlyRate),
		DefectCost:           Round2(totals.DefectHours * hourlyRate),
		NCRCost:              Round2(totals.NCRHours * hourlyRate),
		TotalCoNCCost:        Round2(totals.CoNCHours * hourlyRate),
		DepartmentBreakdown:  make([]models.CoNCDepartmentRollup, 0),
		MachineBreakdown:     make([]models.CoNCMachineRollup, 0),
	}

	totalLabor := resp.TotalProductionHours + resp.TotalCoNCHours
	if totalLabor > 0 {
		resp.CoNCPercentageOfLabor = Round2((resp.TotalCoNCHours / totalLabor) * 100)
	}

	deptRows, err := s.repo.GetSummaryDepartmentRollup(ctx, baseFilter, args)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch department rollup: %w", err)
	}
	for _, d := range deptRows {
		rollup := models.CoNCDepartmentRollup{
			Department:      d.Department,
			TotalHours:      d.TotalHours,
			ProductionHours: d.ProductionHours,
			ReworkHours:     d.ReworkHours,
			DefectHours:     d.DefectHours,
			NCRHours:        d.NCRHours,
			CoNCHours:       d.CoNCHours,
			CoNCCost:        Round2(d.CoNCHours * hourlyRate),
		}
		if d.TotalHours > 0 {
			rollup.CoNCPercentage = Round2((d.CoNCHours / d.TotalHours) * 100)
		}
		resp.DepartmentBreakdown = append(resp.DepartmentBreakdown, rollup)
	}

	mRows, err := s.repo.GetSummaryMachineRollup(ctx, baseFilter, args)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch machine rollup: %w", err)
	}
	for _, m := range mRows {
		rollup := models.CoNCMachineRollup{
			MachineID:       m.MachineID,
			OrderNumber:     m.OrderNumber,
			ModelType:       m.ModelType,
			ProjectName:     m.ProjectName,
			CustomerName:    m.CustomerName,
			TotalHours:      m.TotalHours,
			ProductionHours: m.ProductionHours,
			ReworkHours:     m.ReworkHours,
			DefectHours:     m.DefectHours,
			NCRHours:        m.NCRHours,
			CoNCHours:       m.CoNCHours,
			CoNCCost:        Round2(m.CoNCHours * hourlyRate),
		}
		if m.TotalHours > 0 {
			rollup.CoNCPercentage = Round2((m.CoNCHours / m.TotalHours) * 100)
		}
		resp.MachineBreakdown = append(resp.MachineBreakdown, rollup)
	}

	return resp, nil
}

func (s *service) GetMachineDetail(ctx context.Context, machineID uuid.UUID, hourlyRate float64) (*models.CoNCMachineDetailResponse, error) {
	if hourlyRate <= 0 {
		hourlyRate = DefaultBurdenHourlyRate
	}

	info, err := s.repo.GetMachineInfo(ctx, machineID)
	if err != nil {
		return nil, err
	}

	totals, err := s.repo.GetMachineTotals(ctx, machineID)
	if err != nil {
		return nil, fmt.Errorf("failed to compute machine totals: %w", err)
	}

	resp := &models.CoNCMachineDetailResponse{
		MachineID:            machineID,
		OrderNumber:          info.OrderNumber,
		ModelType:            info.ModelType,
		ProjectName:          info.ProjectName,
		CustomerName:         info.CustomerName,
		HourlyRate:           hourlyRate,
		TotalProductionHours: totals.ProductionHours,
		TotalReworkHours:     totals.ReworkHours,
		TotalDefectHours:     totals.DefectHours,
		TotalNCRHours:        totals.NCRHours,
		TotalCoNCHours:       totals.CoNCHours,
		ReworkCost:           Round2(totals.ReworkHours * hourlyRate),
		DefectCost:           Round2(totals.DefectHours * hourlyRate),
		NCRCost:              Round2(totals.NCRHours * hourlyRate),
		TotalCoNCCost:        Round2(totals.CoNCHours * hourlyRate),
		DepartmentBreakdown:  make([]models.CoNCDepartmentRollup, 0),
		ReworkItems:          make([]models.CoNCReworkItemDetail, 0),
		DefectItems:          make([]models.CoNCDefectItemDetail, 0),
	}

	totalLabor := resp.TotalProductionHours + resp.TotalCoNCHours
	if totalLabor > 0 {
		resp.CoNCPercentageOfLabor = Round2((resp.TotalCoNCHours / totalLabor) * 100)
	}

	deptRows, err := s.repo.GetMachineDepartmentRollup(ctx, machineID)
	if err != nil {
		return nil, fmt.Errorf("failed to compute machine department rollup: %w", err)
	}
	for _, d := range deptRows {
		rollup := models.CoNCDepartmentRollup{
			Department:      d.Department,
			TotalHours:      d.TotalHours,
			ProductionHours: d.ProductionHours,
			ReworkHours:     d.ReworkHours,
			DefectHours:     d.DefectHours,
			NCRHours:        d.NCRHours,
			CoNCHours:       d.CoNCHours,
			CoNCCost:        Round2(d.CoNCHours * hourlyRate),
		}
		if d.TotalHours > 0 {
			rollup.CoNCPercentage = Round2((d.CoNCHours / d.TotalHours) * 100)
		}
		resp.DepartmentBreakdown = append(resp.DepartmentBreakdown, rollup)
	}

	rwItems, err := s.repo.GetMachineReworkItems(ctx, machineID)
	if err == nil {
		for _, rw := range rwItems {
			item := models.CoNCReworkItemDetail{
				ID:             rw.ID,
				PartNumber:     rw.PartNumber,
				Description:    rw.Description,
				Status:         rw.Status,
				IsNCR:          rw.IsNCR,
				EstimatedHours: rw.EstimatedHours,
				ActualHours:    rw.ActualHours,
				Cost:           Round2(rw.ActualHours * hourlyRate),
			}
			resp.ReworkItems = append(resp.ReworkItems, item)
		}
	}

	defItems, err := s.repo.GetMachineDefectItems(ctx, machineID)
	if err == nil {
		for _, def := range defItems {
			item := models.CoNCDefectItemDetail{
				ID:                 def.ID,
				Description:        def.Description,
				Severity:           def.Severity,
				Status:             def.Status,
				AssignedDepartment: def.AssignedDepartment,
				IsNCR:              def.IsNCR,
				NCRNumber:          def.NCRNumber,
				HoursSpent:         def.HoursSpent,
				Cost:               Round2(def.HoursSpent * hourlyRate),
			}
			resp.DefectItems = append(resp.DefectItems, item)
		}
	}

	return resp, nil
}
