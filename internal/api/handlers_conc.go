package api

import (
	"database/sql"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

const defaultBurdenHourlyRate = 85.00

func parseHourlyRate(r *http.Request) float64 {
	rateStr := r.URL.Query().Get("hourly_rate")
	if rateStr != "" {
		if rate, err := strconv.ParseFloat(rateStr, 64); err == nil && rate > 0 {
			return rate
		}
	}
	return defaultBurdenHourlyRate
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}

// handleGetCostOfNonConformanceSummary computes executive shop-wide Cost of Non-Conformance metrics
func handleGetCostOfNonConformanceSummary(w http.ResponseWriter, r *http.Request) {
	hourlyRate := parseHourlyRate(r)
	salesOrderID := r.URL.Query().Get("sales_order_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	var resp models.CoNCSummaryResponse
	resp.HourlyRate = hourlyRate
	resp.DepartmentBreakdown = make([]models.CoNCDepartmentRollup, 0)
	resp.MachineBreakdown = make([]models.CoNCMachineRollup, 0)

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
	}

	// 1. Overall Totals
	totalsQuery := fmt.Sprintf(`
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

	err := db.DB.QueryRowContext(r.Context(), totalsQuery, args...).Scan(
		&resp.TotalProductionHours,
		&resp.TotalReworkHours,
		&resp.TotalDefectHours,
		&resp.TotalNCRHours,
		&resp.TotalCoNCHours,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute CoNC totals", err)
		return
	}

	resp.ReworkCost = round2(resp.TotalReworkHours * hourlyRate)
	resp.DefectCost = round2(resp.TotalDefectHours * hourlyRate)
	resp.NCRCost = round2(resp.TotalNCRHours * hourlyRate)
	resp.TotalCoNCCost = round2(resp.TotalCoNCHours * hourlyRate)

	totalLabor := resp.TotalProductionHours + resp.TotalCoNCHours
	if totalLabor > 0 {
		resp.CoNCPercentageOfLabor = round2((resp.TotalCoNCHours / totalLabor) * 100)
	}

	// 2. Department Breakdown
	deptQuery := fmt.Sprintf(`
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

	deptRows, err := db.DB.QueryContext(r.Context(), deptQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute department CoNC breakdown", err)
		return
	}
	defer deptRows.Close()

	for deptRows.Next() {
		var d models.CoNCDepartmentRollup
		if err := deptRows.Scan(
			&d.Department,
			&d.TotalHours,
			&d.ProductionHours,
			&d.ReworkHours,
			&d.DefectHours,
			&d.NCRHours,
			&d.CoNCHours,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan department CoNC row", err)
			return
		}
		d.CoNCCost = round2(d.CoNCHours * hourlyRate)
		if d.TotalHours > 0 {
			d.CoNCPercentage = round2((d.CoNCHours / d.TotalHours) * 100)
		}
		resp.DepartmentBreakdown = append(resp.DepartmentBreakdown, d)
	}

	// 3. Machine Breakdown
	machineQuery := fmt.Sprintf(`
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

	mRows, err := db.DB.QueryContext(r.Context(), machineQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute machine CoNC breakdown", err)
		return
	}
	defer mRows.Close()

	for mRows.Next() {
		var m models.CoNCMachineRollup
		if err := mRows.Scan(
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
			respondError(w, http.StatusInternalServerError, "Failed to scan machine CoNC row", err)
			return
		}
		m.CoNCCost = round2(m.CoNCHours * hourlyRate)
		if m.TotalHours > 0 {
			m.CoNCPercentage = round2((m.CoNCHours / m.TotalHours) * 100)
		}
		resp.MachineBreakdown = append(resp.MachineBreakdown, m)
	}

	slog.Debug("CoNC summary generated", "total_conc_hours", resp.TotalCoNCHours, "total_conc_cost", resp.TotalCoNCCost, "hourly_rate", hourlyRate)
	respondJSON(w, http.StatusOK, resp)
}

// handleGetMachineCostOfNonConformance computes machine-specific Cost of Non-Conformance details
func handleGetMachineCostOfNonConformance(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	hourlyRate := parseHourlyRate(r)

	var resp models.CoNCMachineDetailResponse
	resp.MachineID = machineID
	resp.HourlyRate = hourlyRate
	resp.DepartmentBreakdown = make([]models.CoNCDepartmentRollup, 0)
	resp.ReworkItems = make([]models.CoNCReworkItemDetail, 0)
	resp.DefectItems = make([]models.CoNCDefectItemDetail, 0)

	// Fetch machine info
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT m.order_number, m.model_type, COALESCE(so.project_name, ''), COALESCE(so.customer_name, '')
		FROM machines m
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE m.id = $1
	`, machineID).Scan(&resp.OrderNumber, &resp.ModelType, &resp.ProjectName, &resp.CustomerName)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Machine not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to fetch machine info", err)
		return
	}

	// 1. Overall Machine Totals
	totalsQuery := `
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
	err = db.DB.QueryRowContext(r.Context(), totalsQuery, machineID).Scan(
		&resp.TotalProductionHours,
		&resp.TotalReworkHours,
		&resp.TotalDefectHours,
		&resp.TotalNCRHours,
		&resp.TotalCoNCHours,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute machine CoNC totals", err)
		return
	}

	resp.ReworkCost = round2(resp.TotalReworkHours * hourlyRate)
	resp.DefectCost = round2(resp.TotalDefectHours * hourlyRate)
	resp.NCRCost = round2(resp.TotalNCRHours * hourlyRate)
	resp.TotalCoNCCost = round2(resp.TotalCoNCHours * hourlyRate)

	totalLabor := resp.TotalProductionHours + resp.TotalCoNCHours
	if totalLabor > 0 {
		resp.CoNCPercentageOfLabor = round2((resp.TotalCoNCHours / totalLabor) * 100)
	}

	// 2. Department Breakdown for this Machine
	deptQuery := `
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
	deptRows, err := db.DB.QueryContext(r.Context(), deptQuery, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute machine department breakdown", err)
		return
	}
	defer deptRows.Close()

	for deptRows.Next() {
		var d models.CoNCDepartmentRollup
		if err := deptRows.Scan(
			&d.Department,
			&d.TotalHours,
			&d.ProductionHours,
			&d.ReworkHours,
			&d.DefectHours,
			&d.NCRHours,
			&d.CoNCHours,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan machine dept CoNC row", err)
			return
		}
		d.CoNCCost = round2(d.CoNCHours * hourlyRate)
		if d.TotalHours > 0 {
			d.CoNCPercentage = round2((d.CoNCHours / d.TotalHours) * 100)
		}
		resp.DepartmentBreakdown = append(resp.DepartmentBreakdown, d)
	}

	// 3. Rework Item Breakdown
	rwQuery := `
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
	rwRows, err := db.DB.QueryContext(r.Context(), rwQuery, machineID)
	if err == nil {
		defer rwRows.Close()
		for rwRows.Next() {
			var item models.CoNCReworkItemDetail
			if err := rwRows.Scan(
				&item.ID,
				&item.PartNumber,
				&item.Description,
				&item.Status,
				&item.IsNCR,
				&item.EstimatedHours,
				&item.ActualHours,
			); err == nil {
				item.Cost = round2(item.ActualHours * hourlyRate)
				resp.ReworkItems = append(resp.ReworkItems, item)
			}
		}
	}

	// 4. Defect Item Breakdown
	defQuery := `
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
	defRows, err := db.DB.QueryContext(r.Context(), defQuery, machineID)
	if err == nil {
		defer defRows.Close()
		for defRows.Next() {
			var def models.CoNCDefectItemDetail
			if err := defRows.Scan(
				&def.ID,
				&def.Description,
				&def.Severity,
				&def.Status,
				&def.AssignedDepartment,
				&def.IsNCR,
				&def.NCRNumber,
				&def.HoursSpent,
			); err == nil {
				def.Cost = round2(def.HoursSpent * hourlyRate)
				resp.DefectItems = append(resp.DefectItems, def)
			}
		}
	}

	slog.Debug("Machine CoNC generated", "machine_id", machineID, "conc_hours", resp.TotalCoNCHours, "conc_cost", resp.TotalCoNCCost)
	respondJSON(w, http.StatusOK, resp)
}
