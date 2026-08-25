package api

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetQuality gets all inspections and their defects for a machine
func handleGetQuality(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	// Fetch inspections
	rows, err := db.DB.Query(`
		SELECT id, machine_id, inspection_type, inspector_name, status, completed_at
		FROM quality_inspections
		WHERE machine_id = $1
		ORDER BY status ASC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	inspections := []models.QualityInspection{}
	for rows.Next() {
		var i models.QualityInspection
		if err := rows.Scan(
			&i.ID, &i.MachineID, &i.InspectionType, &i.InspectorName, &i.Status, &i.CompletedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning inspection: ", err)
			return
		}
		inspections = append(inspections, i)
	}

	// We could also fetch defects here and bundle them, or leave it as a separate endpoint.
	// For simplicity, we just return the inspections in this endpoint.

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, inspections)
}

// handleGetMachineDefects fetches defects for a specific machine
func handleGetMachineDefects(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, inspection_id, source_department, assigned_department, description, severity, status, notes, resolved_by, resolved_at
		FROM defects
		WHERE machine_id = $1
		ORDER BY status ASC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	defects := []models.Defect{}
	for rows.Next() {
		var d models.Defect
		var assigned sql.NullString
		if err := rows.Scan(
			&d.ID, &d.MachineID, &d.InspectionID, &d.SourceDepartment, &assigned, &d.Description,
			&d.Severity, &d.Status, &d.Notes, &d.ResolvedBy, &d.ResolvedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning defect: ", err)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, defects)
}

// handleAddDefect adds a new defect to the machine
func handleAddDefect(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		SourceDepartment   string `json:"source_department"`
		AssignedDepartment string `json:"assigned_department"`
		Description        string `json:"description"`
		Severity           string `json:"severity"`
		Notes              string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.AssignedDepartment == "quality" {
		respondError(w, http.StatusBadRequest, "Defects cannot be assigned to the quality department", nil)
		return
	}

	var newDefect models.Defect
	err := db.DB.QueryRow(`
		INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status, notes)
		VALUES ($1, $2, $3, $4, $5, 'open', $6)
		RETURNING id, machine_id, source_department, assigned_department, description, severity, status, notes, resolved_by, resolved_at
	`, machineID, req.SourceDepartment, req.AssignedDepartment, req.Description, req.Severity, req.Notes).Scan(
		&newDefect.ID, &newDefect.MachineID, &newDefect.SourceDepartment, &newDefect.AssignedDepartment,
		&newDefect.Description, &newDefect.Severity, &newDefect.Status, &newDefect.Notes,
		&newDefect.ResolvedBy, &newDefect.ResolvedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to log defect: ", err)
		return
	}

	BroadcastEvent("defect_added", newDefect)
	slog.Debug("Defect logged", "defect_id", newDefect.ID, "machine_id", machineID)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusCreated, newDefect)
}

// handleGetAllDefects fetches all defects across all machines for the Quality Resolution Hub
func handleGetAllDefects(w http.ResponseWriter, r *http.Request) {
	department := r.URL.Query().Get("department")

	query := `
		SELECT d.id, d.machine_id, m.order_number, d.source_department, d.assigned_department, d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
	`
	var args []interface{}

	if department != "" {
		query += " WHERE d.assigned_department = $1"
		args = append(args, department)
	}

	query += " ORDER BY d.status ASC, m.created_at DESC"

	rows, err := db.DB.Query(query, args...)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	// Use an extended struct to include the order_number for context in the UI
	type DefectWithMachine struct {
		models.Defect
		OrderNumber string `json:"order_number"`
	}

	defects := []DefectWithMachine{}
	for rows.Next() {
		var d DefectWithMachine
		// Coalesce NULL assigned_department to empty string to avoid scan errors if we don't use pointers
		var assigned sql.NullString
		if err := rows.Scan(
			&d.ID, &d.MachineID, &d.OrderNumber, &d.SourceDepartment, &assigned, &d.Description,
			&d.Severity, &d.Status, &d.Notes, &d.ResolvedBy, &d.ResolvedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning defect: ", err)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, defects)
}

// handleUpdateDefect allows updating a defect's status and assignment
func handleUpdateDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		respondError(w, http.StatusBadRequest, "Defect ID is required", nil)
		return
	}

	var req struct {
		Status             string `json:"status"`              // 'fixed' or 'verified'
		AssignedDepartment string `json:"assigned_department"` // optional routing
		Notes              string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updatedDefect models.Defect
	// If assigning department, update it. If updating status, update it.
	// For simplicity, we just dynamically update what is passed.

	err := db.DB.QueryRow(`
		UPDATE defects 
		SET status = COALESCE(NULLIF($2, ''), status),
		    assigned_department = COALESCE(NULLIF($3, ''), assigned_department),
		    notes = COALESCE(NULLIF($4, ''), notes),
		    resolved_at = CASE WHEN $2 IN ('fixed', 'verified') THEN NOW() ELSE resolved_at END, 
		    resolved_by = CASE WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' ELSE resolved_by END
		WHERE id = $1
		RETURNING id, machine_id, source_department, assigned_department, description, severity, status, notes, resolved_by, resolved_at
	`, defectID, req.Status, req.AssignedDepartment, req.Notes).Scan(
		&updatedDefect.ID, &updatedDefect.MachineID, &updatedDefect.SourceDepartment, &updatedDefect.AssignedDepartment,
		&updatedDefect.Description, &updatedDefect.Severity, &updatedDefect.Status, &updatedDefect.Notes,
		&updatedDefect.ResolvedBy, &updatedDefect.ResolvedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update defect: ", err)
		return
	}

	BroadcastEvent("defect_updated", updatedDefect)
	slog.Debug("Defect updated", "defect_id", defectID, "status", updatedDefect.Status)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedDefect)
}

// handleDeleteDefect deletes a defect
func handleDeleteDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		respondError(w, http.StatusBadRequest, "Defect ID is required", nil)
		return
	}

	// Clean up physical attachment files BEFORE the DB delete.
	// The attachments table has ON DELETE CASCADE from defects, so once the
	// defect row is deleted the attachment metadata rows vanish — we must
	// query them first to know which files to remove from disk.
	deleteAttachmentFilesForIssues([]string{defectID})

	_, err := db.DB.Exec("DELETE FROM defects WHERE id = $1", defectID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete defect", err)
		return
	}

	slog.Debug("Defect and associated attachments deleted", "defect_id", defectID)

	// We can broadcast a delete event so the UI can remove it
	BroadcastEvent("defect_deleted", map[string]string{"id": defectID})

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusNoContent)
}

// handleGetMachineDefectsSummary aggregates defect counts by department on the backend
func handleGetMachineDefectsSummary(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT assigned_department, status, severity, COUNT(*) 
		FROM defects 
		WHERE machine_id = $1 
		GROUP BY assigned_department, status, severity
	`, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query defect summary: ", err)
		return
	}
	defer rows.Close()

	// Initialize summary map grouped by department
	summaryMap := make(map[string]*models.DefectSummary)

	for rows.Next() {
		var assigned sql.NullString
		var status, severity string
		var count int

		if err := rows.Scan(&assigned, &status, &severity, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan summary row: ", err)
			return
		}

		dept := ""
		if assigned.Valid {
			dept = assigned.String
		}
		if dept == "" {
			continue // skip unassigned
		}

		if _, exists := summaryMap[dept]; !exists {
			summaryMap[dept] = &models.DefectSummary{
				MachineID:          uuid.MustParse(machineID),
				AssignedDepartment: dept,
			}
		}
		
		s := summaryMap[dept]
		
		s.Total += count

		if status == "open" {
			s.TotalOpen += count
			if severity == "critical" {
				s.OpenCritical += count
			} else if severity == "minor" {
				s.OpenMinor += count
			} else {
				s.OpenModerate += count
			}
		} else if status == "fixed" {
			s.TotalPending += count
			if severity == "critical" {
				s.PendingCritical += count
			} else if severity == "minor" {
				s.PendingMinor += count
			} else {
				s.PendingModerate += count
			}
		} else if status == "verified" {
			s.Closed += count
		}
	}

	// Convert map to slice
	var summaries []models.DefectSummary
	for _, v := range summaryMap {
		summaries = append(summaries, *v)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, summaries)
}

// handleGetAllDefectsSummary aggregates defect counts by department for all machines
func handleGetAllDefectsSummary(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT machine_id, assigned_department, status, severity, COUNT(*) 
		FROM defects 
		GROUP BY machine_id, assigned_department, status, severity
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query all defect summaries: ", err)
		return
	}
	defer rows.Close()

	// Initialize summary map grouped by machine_id + department
	type summaryKey struct {
		MachineID uuid.UUID
		Dept      string
	}
	summaryMap := make(map[summaryKey]*models.DefectSummary)

	for rows.Next() {
		var machineID uuid.UUID
		var assigned sql.NullString
		var status, severity string
		var count int

		if err := rows.Scan(&machineID, &assigned, &status, &severity, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan summary row: ", err)
			return
		}

		dept := ""
		if assigned.Valid {
			dept = assigned.String
		}
		if dept == "" {
			continue // skip unassigned
		}

		key := summaryKey{MachineID: machineID, Dept: dept}
		if _, exists := summaryMap[key]; !exists {
			summaryMap[key] = &models.DefectSummary{
				MachineID:          machineID,
				AssignedDepartment: dept,
			}
		}
		
		s := summaryMap[key]
		
		s.Total += count

		if status == "open" {
			s.TotalOpen += count
			if severity == "critical" {
				s.OpenCritical += count
			} else if severity == "minor" {
				s.OpenMinor += count
			} else {
				s.OpenModerate += count
			}
		} else if status == "fixed" {
			s.TotalPending += count
			if severity == "critical" {
				s.PendingCritical += count
			} else if severity == "minor" {
				s.PendingMinor += count
			} else {
				s.PendingModerate += count
			}
		} else if status == "verified" {
			s.Closed += count
		}
	}

	// Convert map to slice
	var summaries []models.DefectSummary
	for _, v := range summaryMap {
		summaries = append(summaries, *v)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, summaries)
}

// handleGetProjectDefectSummaries aggregates defect counts by sales order
func handleGetMachineDefectSummaries(w http.ResponseWriter, r *http.Request) {
	soStatusNeq := r.URL.Query().Get("so_status_neq")

	query := `
		SELECT d.machine_id, d.status, COUNT(*) 
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
	`
	var args []interface{}
	if soStatusNeq != "" {
		query += `
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE so.status != $1 OR m.sales_order_id IS NULL
		`
		args = append(args, soStatusNeq)
	}

	query += " GROUP BY d.machine_id, d.status"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query machine defect summaries: ", err)
		return
	}
	defer rows.Close()

	summaryMap := make(map[uuid.UUID]*models.MachineDefectSummary)

	for rows.Next() {
		var machineID uuid.UUID
		var status string
		var count int

		if err := rows.Scan(&machineID, &status, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan machine summary row: ", err)
			return
		}

		if _, exists := summaryMap[machineID]; !exists {
			summaryMap[machineID] = &models.MachineDefectSummary{
				MachineID: machineID,
			}
		}

		s := summaryMap[machineID]

		if status == "open" {
			s.TotalOpen += count
		} else if status == "fixed" {
			s.TotalPending += count
		} else if status == "verified" {
			s.TotalClosed += count
		}
	}

	var summaries []models.MachineDefectSummary
	for _, v := range summaryMap {
		summaries = append(summaries, *v)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, summaries)
}

func handleGetProjectDefectSummaries(w http.ResponseWriter, r *http.Request) {
	soStatusNeq := r.URL.Query().Get("so_status_neq")

	query := `
		SELECT m.sales_order_id, d.status, COUNT(*) 
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE m.sales_order_id IS NOT NULL
	`
	var args []interface{}
	if soStatusNeq != "" {
		query += " AND so.status != $1"
		args = append(args, soStatusNeq)
	}
	query += " GROUP BY m.sales_order_id, d.status"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query project defect summaries: ", err)
		return
	}
	defer rows.Close()

	summaryMap := make(map[uuid.UUID]*models.ProjectDefectSummary)

	for rows.Next() {
		var salesOrderID uuid.UUID
		var status string
		var count int

		if err := rows.Scan(&salesOrderID, &status, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan project summary row: ", err)
			return
		}

		if _, exists := summaryMap[salesOrderID]; !exists {
			summaryMap[salesOrderID] = &models.ProjectDefectSummary{
				SalesOrderID: salesOrderID,
			}
		}

		s := summaryMap[salesOrderID]

		if status == "open" {
			s.TotalOpen += count
		} else if status == "fixed" {
			s.TotalPending += count
		} else if status == "verified" {
			s.TotalClosed += count
		}
	}

	var summaries []models.ProjectDefectSummary
	for _, v := range summaryMap {
		summaries = append(summaries, *v)
	}

	if summaries == nil {
		summaries = []models.ProjectDefectSummary{}
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, summaries)
}

func handleGetProjectDepartmentDefectSummaries(w http.ResponseWriter, r *http.Request) {
	soStatusNeq := r.URL.Query().Get("so_status_neq")

	query := `
		SELECT m.sales_order_id, d.assigned_department, d.status, COUNT(*) 
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE m.sales_order_id IS NOT NULL
	`
	var args []interface{}
	if soStatusNeq != "" {
		query += " AND so.status != $1"
		args = append(args, soStatusNeq)
	}
	query += " GROUP BY m.sales_order_id, d.assigned_department, d.status"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query project department defect summaries: ", err)
		return
	}
	defer rows.Close()

	// Use a composite key
	type summaryKey struct {
		SalesOrderID       uuid.UUID
		AssignedDepartment string
	}
	summaryMap := make(map[summaryKey]*models.ProjectDepartmentDefectSummary)

	for rows.Next() {
		var salesOrderID uuid.UUID
		var dept string
		var status string
		var count int

		if err := rows.Scan(&salesOrderID, &dept, &status, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan project department summary row: ", err)
			return
		}

		key := summaryKey{SalesOrderID: salesOrderID, AssignedDepartment: dept}
		if _, exists := summaryMap[key]; !exists {
			summaryMap[key] = &models.ProjectDepartmentDefectSummary{
				SalesOrderID:       salesOrderID,
				AssignedDepartment: dept,
			}
		}

		s := summaryMap[key]

		if status == "open" {
			s.TotalOpen += count
		} else if status == "fixed" {
			s.TotalPending += count
		} else if status == "verified" {
			s.TotalClosed += count
		}
	}

	var summaries []models.ProjectDepartmentDefectSummary
	for _, v := range summaryMap {
		summaries = append(summaries, *v)
	}

	if summaries == nil {
		summaries = []models.ProjectDepartmentDefectSummary{}
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, summaries)
}

// handleEditDefect fully updates a defect
func handleEditDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		respondError(w, http.StatusBadRequest, "Defect ID is required", nil)
		return
	}

	var req struct {
		SourceDepartment   string `json:"source_department"`
		AssignedDepartment string `json:"assigned_department"`
		Severity           string `json:"severity"`
		Description        string `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.AssignedDepartment == "quality" {
		respondError(w, http.StatusBadRequest, "Defects cannot be assigned to the quality department", nil)
		return
	}

	var updated models.Defect
	err := db.DB.QueryRow(`
		UPDATE defects 
		SET source_department = $2, assigned_department = $3, severity = $4, description = $5
		WHERE id = $1
		RETURNING id, machine_id, source_department, assigned_department, description, severity, status, resolved_by, resolved_at
	`, defectID, req.SourceDepartment, req.AssignedDepartment, req.Severity, req.Description).Scan(
		&updated.ID, &updated.MachineID, &updated.SourceDepartment, &updated.AssignedDepartment,
		&updated.Description, &updated.Severity, &updated.Status, &updated.ResolvedBy, &updated.ResolvedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update defect: ", err)
		return
	}

	BroadcastEvent("defect_updated", updated)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updated)
}
