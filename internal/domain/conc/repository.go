package conc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// RawTotals holds uncalculated aggregate hour counts
type RawTotals struct {
	ProductionHours float64
	ReworkHours     float64
	DefectHours     float64
	NCRHours        float64
	CoNCHours       float64
}

// RawDepartmentRollup holds raw hours per department
type RawDepartmentRollup struct {
	Department      string
	TotalHours      float64
	ProductionHours float64
	ReworkHours     float64
	DefectHours     float64
	NCRHours        float64
	CoNCHours       float64
}

// RawMachineRollup holds raw hours per machine/sales order
type RawMachineRollup struct {
	MachineID       uuid.UUID
	OrderNumber     string
	ModelType       string
	ProjectName     string
	CustomerName    string
	TotalHours      float64
	ProductionHours float64
	ReworkHours     float64
	DefectHours     float64
	NCRHours        float64
	CoNCHours       float64
}

// MachineInfo holds machine and sales order metadata
type MachineInfo struct {
	OrderNumber  string
	ModelType    string
	ProjectName  string
	CustomerName string
}

// RawReworkItem holds raw rework item metrics
type RawReworkItem struct {
	ID             uuid.UUID
	PartNumber     string
	Description    string
	Status         string
	IsNCR          bool
	EstimatedHours float64
	ActualHours    float64
}

// RawDefectItem holds raw defect item metrics
type RawDefectItem struct {
	ID                 uuid.UUID
	Description        string
	Severity           string
	Status             string
	AssignedDepartment string
	IsNCR              bool
	NCRNumber          *string
	HoursSpent         float64
}

// Repository defines data access for Cost of Non-Conformance
type Repository interface {
	GetSummaryTotals(ctx context.Context, baseFilter string, args []interface{}) (RawTotals, error)
	GetSummaryDepartmentRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawDepartmentRollup, error)
	GetSummaryMachineRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawMachineRollup, error)

	GetMachineInfo(ctx context.Context, machineID uuid.UUID) (MachineInfo, error)
	GetMachineTotals(ctx context.Context, machineID uuid.UUID) (RawTotals, error)
	GetMachineDepartmentRollup(ctx context.Context, machineID uuid.UUID) ([]RawDepartmentRollup, error)
	GetMachineReworkItems(ctx context.Context, machineID uuid.UUID) ([]RawReworkItem, error)
	GetMachineDefectItems(ctx context.Context, machineID uuid.UUID) ([]RawDefectItem, error)
}

type sqlRepository struct {
	db *sql.DB
}

// NewRepository creates a new PostgreSQL-backed CoNC repository
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) GetSummaryTotals(ctx context.Context, baseFilter string, args []interface{}) (RawTotals, error) {
	var totals RawTotals
	query := fmt.Sprintf(`
		SELECT 
			COALESCE(SUM(CASE WHEN te.entry_type = 'production' THEN te.hours_spent ELSE 0 END), 0.00) AS production_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'rework' THEN te.hours_spent ELSE 0 END), 0.00) AS rework_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'issue_fix' AND NOT COALESCE(d.is_ncr, false) THEN te.hours_spent ELSE 0 END), 0.00) AS defect_hours,
			COALESCE(SUM(CASE WHEN (te.entry_type = 'issue_fix' AND COALESCE(d.is_ncr, false)) OR (te.entry_type = 'rework' AND COALESCE(rwd.is_ncr, false)) THEN te.hours_spent ELSE 0 END), 0.00) AS ncr_hours,
			COALESCE(SUM(CASE WHEN te.entry_type IN ('rework', 'issue_fix') THEN te.hours_spent ELSE 0 END), 0.00) AS total_conc_hours
		FROM time_entries te
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN defects d ON te.defect_id = d.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		LEFT JOIN defects rwd ON rw.defect_id = rwd.id
		%s
	`, baseFilter)

	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&totals.ProductionHours,
		&totals.ReworkHours,
		&totals.DefectHours,
		&totals.NCRHours,
		&totals.CoNCHours,
	)
	return totals, err
}

func (r *sqlRepository) GetSummaryDepartmentRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawDepartmentRollup, error) {
	query := fmt.Sprintf(`
		SELECT 
			COALESCE(NULLIF(dt.department, ''), NULLIF(pt.department, ''), NULLIF(d.assigned_department, ''), NULLIF(u.department, ''), 'unassigned') AS department,
			COALESCE(SUM(te.hours_spent), 0.00) AS total_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'production' THEN te.hours_spent ELSE 0 END), 0.00) AS production_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'rework' THEN te.hours_spent ELSE 0 END), 0.00) AS rework_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'issue_fix' AND NOT COALESCE(d.is_ncr, false) THEN te.hours_spent ELSE 0 END), 0.00) AS defect_hours,
			COALESCE(SUM(CASE WHEN (te.entry_type = 'issue_fix' AND COALESCE(d.is_ncr, false)) OR (te.entry_type = 'rework' AND COALESCE(rwd.is_ncr, false)) THEN te.hours_spent ELSE 0 END), 0.00) AS ncr_hours,
			COALESCE(SUM(CASE WHEN te.entry_type IN ('rework', 'issue_fix') THEN te.hours_spent ELSE 0 END), 0.00) AS conc_hours
		FROM time_entries te
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN defects d ON te.defect_id = d.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		LEFT JOIN defects rwd ON rw.defect_id = rwd.id
		LEFT JOIN users u ON te.user_id = u.id
		%s
		GROUP BY COALESCE(NULLIF(dt.department, ''), NULLIF(pt.department, ''), NULLIF(d.assigned_department, ''), NULLIF(u.department, ''), 'unassigned')
		ORDER BY conc_hours DESC, total_hours DESC
	`, baseFilter)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RawDepartmentRollup
	for rows.Next() {
		var d RawDepartmentRollup
		if err := rows.Scan(
			&d.Department,
			&d.TotalHours,
			&d.ProductionHours,
			&d.ReworkHours,
			&d.DefectHours,
			&d.NCRHours,
			&d.CoNCHours,
		); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, nil
}

func (r *sqlRepository) GetSummaryMachineRollup(ctx context.Context, baseFilter string, args []interface{}) ([]RawMachineRollup, error) {
	query := fmt.Sprintf(`
		SELECT 
			m.id AS machine_id,
			COALESCE(m.order_number, 'None') AS order_number,
			COALESCE(m.model_type, '') AS model_type,
			COALESCE(so.project_name, '') AS project_name,
			COALESCE(so.customer_name, '') AS customer_name,
			COALESCE(SUM(te.hours_spent), 0.00) AS total_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'production' THEN te.hours_spent ELSE 0 END), 0.00) AS production_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'rework' THEN te.hours_spent ELSE 0 END), 0.00) AS rework_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'issue_fix' AND NOT COALESCE(d.is_ncr, false) THEN te.hours_spent ELSE 0 END), 0.00) AS defect_hours,
			COALESCE(SUM(CASE WHEN (te.entry_type = 'issue_fix' AND COALESCE(d.is_ncr, false)) OR (te.entry_type = 'rework' AND COALESCE(rwd.is_ncr, false)) THEN te.hours_spent ELSE 0 END), 0.00) AS ncr_hours,
			COALESCE(SUM(CASE WHEN te.entry_type IN ('rework', 'issue_fix') THEN te.hours_spent ELSE 0 END), 0.00) AS conc_hours
		FROM time_entries te
		JOIN machines m ON te.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		LEFT JOIN defects d ON te.defect_id = d.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		LEFT JOIN defects rwd ON rw.defect_id = rwd.id
		%s
		GROUP BY m.id, m.order_number, m.model_type, so.project_name, so.customer_name
		ORDER BY conc_hours DESC, total_hours DESC
	`, baseFilter)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RawMachineRollup
	for rows.Next() {
		var m RawMachineRollup
		if err := rows.Scan(
			&m.MachineID,
			&m.OrderNumber,
			&m.ModelType,
			&m.ProjectName,
			&m.CustomerName,
			&m.TotalHours,
			&m.ProductionHours,
			&m.ReworkHours,
			&m.DefectHours,
			&m.NCRHours,
			&m.CoNCHours,
		); err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, nil
}

func (r *sqlRepository) GetMachineInfo(ctx context.Context, machineID uuid.UUID) (MachineInfo, error) {
	var info MachineInfo
	err := r.db.QueryRowContext(ctx, `
		SELECT m.order_number, m.model_type, COALESCE(so.project_name, ''), COALESCE(so.customer_name, '')
		FROM machines m
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE m.id = $1
	`, machineID).Scan(&info.OrderNumber, &info.ModelType, &info.ProjectName, &info.CustomerName)
	return info, err
}

func (r *sqlRepository) GetMachineTotals(ctx context.Context, machineID uuid.UUID) (RawTotals, error) {
	var totals RawTotals
	query := `
		SELECT 
			COALESCE(SUM(CASE WHEN te.entry_type = 'production' THEN te.hours_spent ELSE 0 END), 0.00) AS production_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'rework' THEN te.hours_spent ELSE 0 END), 0.00) AS rework_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'issue_fix' AND NOT COALESCE(d.is_ncr, false) THEN te.hours_spent ELSE 0 END), 0.00) AS defect_hours,
			COALESCE(SUM(CASE WHEN (te.entry_type = 'issue_fix' AND COALESCE(d.is_ncr, false)) OR (te.entry_type = 'rework' AND COALESCE(rwd.is_ncr, false)) THEN te.hours_spent ELSE 0 END), 0.00) AS ncr_hours,
			COALESCE(SUM(CASE WHEN te.entry_type IN ('rework', 'issue_fix') THEN te.hours_spent ELSE 0 END), 0.00) AS total_conc_hours
		FROM time_entries te
		LEFT JOIN defects d ON te.defect_id = d.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		LEFT JOIN defects rwd ON rw.defect_id = rwd.id
		WHERE te.machine_id = $1
	`
	err := r.db.QueryRowContext(ctx, query, machineID).Scan(
		&totals.ProductionHours,
		&totals.ReworkHours,
		&totals.DefectHours,
		&totals.NCRHours,
		&totals.CoNCHours,
	)
	return totals, err
}

func (r *sqlRepository) GetMachineDepartmentRollup(ctx context.Context, machineID uuid.UUID) ([]RawDepartmentRollup, error) {
	query := `
		SELECT 
			COALESCE(NULLIF(dt.department, ''), NULLIF(pt.department, ''), NULLIF(d.assigned_department, ''), NULLIF(u.department, ''), 'unassigned') AS department,
			COALESCE(SUM(te.hours_spent), 0.00) AS total_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'production' THEN te.hours_spent ELSE 0 END), 0.00) AS production_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'rework' THEN te.hours_spent ELSE 0 END), 0.00) AS rework_hours,
			COALESCE(SUM(CASE WHEN te.entry_type = 'issue_fix' AND NOT COALESCE(d.is_ncr, false) THEN te.hours_spent ELSE 0 END), 0.00) AS defect_hours,
			COALESCE(SUM(CASE WHEN (te.entry_type = 'issue_fix' AND COALESCE(d.is_ncr, false)) OR (te.entry_type = 'rework' AND COALESCE(rwd.is_ncr, false)) THEN te.hours_spent ELSE 0 END), 0.00) AS ncr_hours,
			COALESCE(SUM(CASE WHEN te.entry_type IN ('rework', 'issue_fix') THEN te.hours_spent ELSE 0 END), 0.00) AS conc_hours
		FROM time_entries te
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN defects d ON te.defect_id = d.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		LEFT JOIN defects rwd ON rw.defect_id = rwd.id
		LEFT JOIN users u ON te.user_id = u.id
		WHERE te.machine_id = $1
		GROUP BY COALESCE(NULLIF(dt.department, ''), NULLIF(pt.department, ''), NULLIF(d.assigned_department, ''), NULLIF(u.department, ''), 'unassigned')
		ORDER BY conc_hours DESC, total_hours DESC
	`
	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RawDepartmentRollup
	for rows.Next() {
		var d RawDepartmentRollup
		if err := rows.Scan(
			&d.Department,
			&d.TotalHours,
			&d.ProductionHours,
			&d.ReworkHours,
			&d.DefectHours,
			&d.NCRHours,
			&d.CoNCHours,
		); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, nil
}

func (r *sqlRepository) GetMachineReworkItems(ctx context.Context, machineID uuid.UUID) ([]RawReworkItem, error) {
	query := `
		SELECT 
			rw.id, rw.part_number, rw.description, rw.status,
			COALESCE(d.is_ncr, false) AS is_ncr,
			rw.estimated_hours,
			COALESCE(SUM(te.hours_spent), rw.actual_hours, 0.00) AS actual_hours
		FROM rework_items rw
		LEFT JOIN defects d ON rw.defect_id = d.id
		LEFT JOIN time_entries te ON te.rework_item_id = rw.id
		WHERE rw.machine_id = $1
		GROUP BY rw.id, rw.part_number, rw.description, rw.status, d.is_ncr, rw.estimated_hours, rw.actual_hours
		ORDER BY actual_hours DESC, rw.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RawReworkItem
	for rows.Next() {
		var item RawReworkItem
		if err := rows.Scan(
			&item.ID,
			&item.PartNumber,
			&item.Description,
			&item.Status,
			&item.IsNCR,
			&item.EstimatedHours,
			&item.ActualHours,
		); err == nil {
			result = append(result, item)
		}
	}
	return result, nil
}

func (r *sqlRepository) GetMachineDefectItems(ctx context.Context, machineID uuid.UUID) ([]RawDefectItem, error) {
	query := `
		SELECT 
			d.id, d.description, d.severity, d.status,
			COALESCE(d.assigned_department, 'quality') AS assigned_department,
			d.is_ncr, d.ncr_number,
			COALESCE(SUM(te.hours_spent), 0.00) AS hours_spent
		FROM defects d
		LEFT JOIN time_entries te ON te.defect_id = d.id AND te.entry_type = 'issue_fix'
		WHERE d.machine_id = $1
		GROUP BY d.id, d.description, d.severity, d.status, d.assigned_department, d.is_ncr, d.ncr_number
		ORDER BY hours_spent DESC, d.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []RawDefectItem
	for rows.Next() {
		var def RawDefectItem
		if err := rows.Scan(
			&def.ID,
			&def.Description,
			&def.Severity,
			&def.Status,
			&def.AssignedDepartment,
			&def.IsNCR,
			&def.NCRNumber,
			&def.HoursSpent,
		); err == nil {
			result = append(result, def)
		}
	}
	return result, nil
}
