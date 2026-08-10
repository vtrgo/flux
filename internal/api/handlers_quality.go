package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetQuality gets all inspections and their defects for a machine
func handleGetQuality(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
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
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	inspections := []models.QualityInspection{}
	for rows.Next() {
		var i models.QualityInspection
		if err := rows.Scan(
			&i.ID, &i.MachineID, &i.InspectionType, &i.InspectorName, &i.Status, &i.CompletedAt,
		); err != nil {
			http.Error(w, "Error scanning inspection: "+err.Error(), http.StatusInternalServerError)
			return
		}
		inspections = append(inspections, i)
	}

	// We could also fetch defects here and bundle them, or leave it as a separate endpoint.
	// For simplicity, we just return the inspections in this endpoint.

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(inspections)
}

// handleGetMachineDefects fetches defects for a specific machine
func handleGetMachineDefects(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, inspection_id, source_department, assigned_department, description, severity, status, notes, resolved_by, resolved_at
		FROM defects
		WHERE machine_id = $1
		ORDER BY status ASC
	`, machineID)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
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
			http.Error(w, "Error scanning defect: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(defects)
}

// handleAddDefect adds a new defect to the machine
func handleAddDefect(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		SourceDepartment string `json:"source_department"`
		AssignedDepartment string `json:"assigned_department"`
		Description      string `json:"description"`
		Severity         string `json:"severity"`
		Notes            string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Failed to log defect: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("defect_added", newDefect)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newDefect)
}

// handleGetAllDefects fetches all defects across all machines for the Quality Resolution Hub
func handleGetAllDefects(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT d.id, d.machine_id, m.order_number, d.source_department, d.assigned_department, d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		ORDER BY d.status ASC, m.created_at DESC
	`)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
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
			http.Error(w, "Error scanning defect: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(defects)
}

// handleUpdateDefect allows updating a defect's status and assignment
func handleUpdateDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		http.Error(w, "Defect ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Status string `json:"status"` // 'fixed' or 'verified'
		AssignedDepartment string `json:"assigned_department"` // optional routing
		Notes string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Failed to update defect: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("defect_updated", updatedDefect)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(updatedDefect)
}

// handleDeleteDefect deletes a defect
func handleDeleteDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		http.Error(w, "Defect ID is required", http.StatusBadRequest)
		return
	}

	_, err := db.DB.Exec("DELETE FROM defects WHERE id = $1", defectID)
	if err != nil {
		http.Error(w, "Failed to delete defect: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// We can broadcast a delete event so the UI can remove it
	BroadcastEvent("defect_deleted", map[string]string{"id": defectID})

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusNoContent)
}

// handleEditDefect fully updates a defect
func handleEditDefect(w http.ResponseWriter, r *http.Request) {
	defectID := r.PathValue("defect_id")
	if defectID == "" {
		http.Error(w, "Defect ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		SourceDepartment   string `json:"source_department"`
		AssignedDepartment string `json:"assigned_department"`
		Severity           string `json:"severity"`
		Description        string `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Failed to update defect: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("defect_updated", updated)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(updated)
}
