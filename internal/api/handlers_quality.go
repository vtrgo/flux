package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
	"github.com/vtrgo/flux/internal/notifications"
)

func parseDueDate(dateStr *string) (*time.Time, error) {
	if dateStr == nil || *dateStr == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, *dateStr)
	if err == nil {
		return &t, nil
	}
	t, err = time.Parse("2006-01-02", *dateStr)
	if err == nil {
		return &t, nil
	}
	return nil, fmt.Errorf("invalid due_date format, expected RFC3339 or YYYY-MM-DD")
}


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
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}
	defer rows.Close()

	inspections := []models.QualityInspection{}
	for rows.Next() {
		var i models.QualityInspection
		if err := rows.Scan(
			&i.ID, &i.MachineID, &i.InspectionType, &i.InspectorName, &i.Status, &i.CompletedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning inspection", err)
			return
		}
		inspections = append(inspections, i)
	}

	// We could also fetch defects here and bundle them, or leave it as a separate endpoint.
	// For simplicity, we just return the inspections in this endpoint.

	respondJSON(w, http.StatusOK, inspections)
}

// handleGetMachineDefects fetches defects for a specific machine with optional department filtering
func handleGetMachineDefects(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	department := r.URL.Query().Get("department")

	query := `
		SELECT d.id, d.machine_id, COALESCE(m.order_number, '') as order_number, d.inspection_id, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, 
              d.created_by_user_id, c.username as created_by_user_name, 
              d.fixed_by_user_id, f.username as fixed_by_user_name, 
              d.verified_by_user_id, v.username as verified_by_user_name,
              d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at, d.due_date,
              d.is_ncr, d.ncr_number, d.assembler, d.location, d.root_cause, d.corrective_action, d.closeout_date, d.team_lead_signature
		FROM defects d
		LEFT JOIN machines m ON d.machine_id = m.id
		LEFT JOIN users u ON d.assigned_user_id = u.id
		LEFT JOIN users c ON d.created_by_user_id = c.id
		LEFT JOIN users f ON d.fixed_by_user_id = f.id
		LEFT JOIN users v ON d.verified_by_user_id = v.id
		WHERE d.machine_id = $1
	`
	args := []interface{}{machineID}
	if department != "" {
		query += " AND (d.assigned_department = $2 OR ($2 = 'electrical_controls' AND d.assigned_department = 'controls'))"
		args = append(args, department)
	}
	query += " ORDER BY d.status ASC"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}
	defer rows.Close()

	defects := []models.Defect{}
	for rows.Next() {
		var d models.Defect
		var assigned sql.NullString
		if err := rows.Scan(
			&d.ID, &d.MachineID, &d.OrderNumber, &d.InspectionID, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.CreatedByUserID, &d.CreatedByUserName, &d.FixedByUserID, &d.FixedByUserName, &d.VerifiedByUserID, &d.VerifiedByUserName, &d.Description,
			&d.Severity, &d.Status, &d.Notes, &d.ResolvedBy, &d.ResolvedAt, &d.CreatedAt, &d.DueDate,
			&d.IsNCR, &d.NCRNumber, &d.Assembler, &d.Location, &d.RootCause, &d.CorrectiveAction, &d.CloseoutDate, &d.TeamLeadSignature,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning defect", err)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

	respondJSON(w, http.StatusOK, defects)
}

// generateNextNCRNumber generates the next sequential NCR number in format NCR-YYYY-XXX
func generateNextNCRNumber() (string, error) {
	year := time.Now().Format("2006")
	prefix := fmt.Sprintf("NCR-%s-", year)

	var lastNumber sql.NullString
	err := db.DB.QueryRow(`
		SELECT ncr_number 
		FROM defects 
		WHERE is_ncr = TRUE AND ncr_number LIKE $1
		ORDER BY ncr_number DESC 
		LIMIT 1
	`, prefix+"%").Scan(&lastNumber)

	if err != nil && err != sql.ErrNoRows {
		return "", err
	}

	nextSeq := 1
	if lastNumber.Valid && len(lastNumber.String) > len(prefix) {
		var seq int
		_, scanErr := fmt.Sscanf(lastNumber.String[len(prefix):], "%d", &seq)
		if scanErr == nil {
			nextSeq = seq + 1
		}
	}

	return fmt.Sprintf("%s%03d", prefix, nextSeq), nil
}

// handleAddDefect adds a new defect to the machine
func handleAddDefect(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		SourceDepartment   string  `json:"source_department"`
		AssignedDepartment string  `json:"assigned_department"`
		AssignedUserID     *string `json:"assigned_user_id"`
		Description        string  `json:"description"`
		Severity           string  `json:"severity"`
		Notes              string  `json:"notes"`
		DueDate            *string `json:"due_date"`
		SendNotification   bool    `json:"send_notification"`

		// NCR fields
		IsNCR             bool    `json:"is_ncr"`
		NCRNumber         *string `json:"ncr_number"`
		Assembler         *string `json:"assembler"`
		Location          *string `json:"location"`
		RootCause         *string `json:"root_cause"`
		CorrectiveAction  *string `json:"corrective_action"`
		CloseoutDate      *string `json:"closeout_date"`
		TeamLeadSignature *string `json:"team_lead_signature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if len(req.Description) > 255 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 255 characters", nil)
		return
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	if req.IsNCR {
		if req.NCRNumber == nil || *req.NCRNumber == "" {
			genNum, genErr := generateNextNCRNumber()
			if genErr != nil {
				respondError(w, http.StatusInternalServerError, "Failed to generate NCR number", genErr)
				return
			}
			req.NCRNumber = &genNum
		}
		if req.AssignedDepartment == "" {
			req.AssignedDepartment = "assembly"
		}
		if req.Severity == "" {
			req.Severity = "moderate"
		}
	}

	authUserID := getAuthenticatedUserID(r)
	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	}

	var assignedUserEmail *string
	var machineOrderNumber string
	var openedByName string
	var newDefect models.Defect

	err = db.DB.QueryRow(`
		WITH inserted AS (
			INSERT INTO defects (
				machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, 
				description, severity, status, notes, due_date,
				is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
			)
			VALUES ($1, $2, $3, $4, NULLIF($8, '')::uuid, $5, $6, 'open', $7, $9, $10, $11, $12, $13, $14, $15, $16, $17)
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
		)
		SELECT i.*, 
		       u.username as assigned_user_name, 
		       c.username as created_by_user_name, 
		       f.username as fixed_by_user_name, 
		       v.username as verified_by_user_name,
		       u.email as assigned_user_email,
		       COALESCE(m.order_number, '') as machine_order_number,
		       COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), c.username, 'System') as opened_by_name
		FROM inserted i 
		LEFT JOIN users u ON i.assigned_user_id = u.id
		LEFT JOIN users c ON i.created_by_user_id = c.id
		LEFT JOIN users f ON i.fixed_by_user_id = f.id
		LEFT JOIN users v ON i.verified_by_user_id = v.id
		LEFT JOIN machines m ON i.machine_id = m.id
	`, machineID, req.SourceDepartment, req.AssignedDepartment, assignedUserID, req.Description, req.Severity, req.Notes, authUserID, parsedDueDate,
		req.IsNCR, req.NCRNumber, req.Assembler, req.Location, req.RootCause, req.CorrectiveAction, parsedCloseoutDate, req.TeamLeadSignature,
	).Scan(
		&newDefect.ID, &newDefect.MachineID, &newDefect.SourceDepartment, &newDefect.AssignedDepartment, &newDefect.AssignedUserID, &newDefect.CreatedByUserID, &newDefect.FixedByUserID, &newDefect.VerifiedByUserID, &newDefect.Description, &newDefect.Severity, &newDefect.Status, &newDefect.Notes, &newDefect.ResolvedBy, &newDefect.ResolvedAt, &newDefect.CreatedAt, &newDefect.DueDate,
		&newDefect.IsNCR, &newDefect.NCRNumber, &newDefect.Assembler, &newDefect.Location, &newDefect.RootCause, &newDefect.CorrectiveAction, &newDefect.CloseoutDate, &newDefect.TeamLeadSignature,
		&newDefect.AssignedUserName, &newDefect.CreatedByUserName, &newDefect.FixedByUserName, &newDefect.VerifiedByUserName,
		&assignedUserEmail, &machineOrderNumber, &openedByName,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to log defect", err)
		return
	}

	newDefect.OrderNumber = machineOrderNumber

	BroadcastEvent("defect_added", newDefect)
	slog.Debug("Defect logged", "defect_id", newDefect.ID, "machine_id", machineID, "is_ncr", newDefect.IsNCR)

	if req.SendNotification {
		dispatchDefectNotification(r.Context(), newDefect, assignedUserEmail, machineOrderNumber, openedByName)
	}

	respondJSON(w, http.StatusCreated, newDefect)
}

// dispatchDefectNotification resolves site settings and enqueues the notification asynchronously.
func dispatchDefectNotification(ctx context.Context, defect models.Defect, assignedUserEmail *string, machineOrderNumber, openedByName string) {
	recipientEmail := ""
	if assignedUserEmail != nil {
		recipientEmail = *assignedUserEmail
	}

	siteTz := DefaultFallbackTimezone
	var dbTz string
	if tzErr := db.DB.QueryRowContext(ctx, "SELECT value FROM system_settings WHERE key = 'timezone'").Scan(&dbTz); tzErr == nil && dbTz != "" {
		siteTz = dbTz
	}

	ncrNumber := ""
	if defect.NCRNumber != nil {
		ncrNumber = *defect.NCRNumber
	}
	assembler := ""
	if defect.Assembler != nil {
		assembler = *defect.Assembler
	}
	location := ""
	if defect.Location != nil {
		location = *defect.Location
	}
	rootCause := ""
	if defect.RootCause != nil {
		rootCause = *defect.RootCause
	}
	correctiveAction := ""
	if defect.CorrectiveAction != nil {
		correctiveAction = *defect.CorrectiveAction
	}
	teamLeadSignature := ""
	if defect.TeamLeadSignature != nil {
		teamLeadSignature = *defect.TeamLeadSignature
	}

	notif := notifications.IssueNotification{
		DefectID:          defect.ID,
		MachineID:         defect.MachineID,
		MachineNumber:     machineOrderNumber,
		Description:       defect.Description,
		Severity:          defect.Severity,
		AssignedDept:      defect.AssignedDepartment,
		RecipientEmail:    recipientEmail,
		OpenedByName:      openedByName,
		DateOpened:        defect.CreatedAt,
		DueDate:           defect.DueDate,
		Timezone:          siteTz,
		IsNCR:             defect.IsNCR,
		NCRNumber:         ncrNumber,
		Assembler:         assembler,
		Location:          location,
		RootCause:         rootCause,
		CorrectiveAction:  correctiveAction,
		TeamLeadSignature: teamLeadSignature,
		Status:            defect.Status,
	}

	notifications.Dispatch(notif)

	alertType := "defect"
	title := fmt.Sprintf("Issue Logged: %s", notif.MachineNumber)
	if notif.IsNCR {
		alertType = "ncr"
		if notif.NCRNumber != "" {
			title = fmt.Sprintf("NCR %s Logged: %s", notif.NCRNumber, notif.MachineNumber)
		} else {
			title = fmt.Sprintf("NCR Logged: %s", notif.MachineNumber)
		}
	}

	BroadcastEvent("notification_alert", map[string]interface{}{
		"id":              notif.DefectID.String(),
		"type":            alertType,
		"machine_id":      notif.MachineID.String(),
		"machine_number":  notif.MachineNumber,
		"title":           title,
		"description":     notif.Description,
		"severity":        notif.Severity,
		"department":      notif.AssignedDept,
		"recipient_email": notif.RecipientEmail,
		"opened_by":       notif.OpenedByName,
		"created_at":      notif.DateOpened.Format(time.RFC3339),
		"is_ncr":          notif.IsNCR,
		"ncr_number":      notif.NCRNumber,
	})
}

// handleGetAllDefects fetches all defects across all machines for the Quality Resolution Hub
func handleGetAllDefects(w http.ResponseWriter, r *http.Request) {
	department := r.URL.Query().Get("department")

	query := `
		SELECT d.id, d.machine_id, m.order_number, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, 
              d.created_by_user_id, c.username as created_by_user_name, 
              d.fixed_by_user_id, f.username as fixed_by_user_name, 
              d.verified_by_user_id, v.username as verified_by_user_name,
              d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at, d.due_date,
              d.is_ncr, d.ncr_number, d.assembler, d.location, d.root_cause, d.corrective_action, d.closeout_date, d.team_lead_signature
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		LEFT JOIN users u ON d.assigned_user_id = u.id
		LEFT JOIN users c ON d.created_by_user_id = c.id
		LEFT JOIN users f ON d.fixed_by_user_id = f.id
		LEFT JOIN users v ON d.verified_by_user_id = v.id
		WHERE (so.status IS NULL OR so.status != 'closed')
	`
	var args []interface{}

	if department != "" {
		query += " AND d.assigned_department = $1"
		args = append(args, department)
	}

	query += " ORDER BY d.status ASC, m.created_at DESC"

	rows, err := db.DB.Query(query, args...)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}
	defer rows.Close()

	defects := []models.Defect{}
	for rows.Next() {
		var d models.Defect
		// Coalesce NULL assigned_department to empty string to avoid scan errors if we don't use pointers
		var assigned sql.NullString
		if err := rows.Scan(
			&d.ID, &d.MachineID, &d.OrderNumber, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.CreatedByUserID, &d.CreatedByUserName, &d.FixedByUserID, &d.FixedByUserName, &d.VerifiedByUserID, &d.VerifiedByUserName, &d.Description,
			&d.Severity, &d.Status, &d.Notes, &d.ResolvedBy, &d.ResolvedAt, &d.CreatedAt, &d.DueDate,
			&d.IsNCR, &d.NCRNumber, &d.Assembler, &d.Location, &d.RootCause, &d.CorrectiveAction, &d.CloseoutDate, &d.TeamLeadSignature,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning defect", err)
			return
		}
		if assigned.Valid {
			d.AssignedDepartment = assigned.String
		}
		defects = append(defects, d)
	}

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

	authUserID := getAuthenticatedUserID(r)
	var updatedDefect models.Defect
	// If assigning department, update it. If updating status, update it.
	// For simplicity, we just dynamically update what is passed.

	err := db.DB.QueryRow(`
		WITH updated AS (
			UPDATE defects 
			SET status = COALESCE(NULLIF($2, ''), status),
			    assigned_department = COALESCE(NULLIF($3, ''), assigned_department),
			    notes = COALESCE(NULLIF($4, ''), notes),
			    resolved_at = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN NOW() 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_at 
			    END, 
			    resolved_by = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_by 
			    END,
			    fixed_by_user_id = CASE
			        WHEN $2 = 'fixed' THEN NULLIF($5, '')::uuid
			        WHEN $2 = 'open' THEN NULL
			        ELSE fixed_by_user_id
			    END,
			    verified_by_user_id = CASE
			        WHEN $2 = 'verified' THEN NULLIF($5, '')::uuid
			        WHEN $2 = 'open' THEN NULL
			        ELSE verified_by_user_id
			    END
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
		)
		SELECT u_tbl.*, 
		       COALESCE(m.order_number, '') as order_number,
		       u.username as assigned_user_name, c.username as created_by_user_name, f.username as fixed_by_user_name, v.username as verified_by_user_name
		FROM updated u_tbl
		LEFT JOIN machines m ON u_tbl.machine_id = m.id
		LEFT JOIN users u ON u_tbl.assigned_user_id = u.id
		LEFT JOIN users c ON u_tbl.created_by_user_id = c.id
		LEFT JOIN users f ON u_tbl.fixed_by_user_id = f.id
		LEFT JOIN users v ON u_tbl.verified_by_user_id = v.id
	`, defectID, req.Status, req.AssignedDepartment, req.Notes, authUserID).Scan(
		&updatedDefect.ID, &updatedDefect.MachineID, &updatedDefect.SourceDepartment, &updatedDefect.AssignedDepartment, &updatedDefect.AssignedUserID, &updatedDefect.CreatedByUserID, &updatedDefect.FixedByUserID, &updatedDefect.VerifiedByUserID, &updatedDefect.Description, &updatedDefect.Severity, &updatedDefect.Status, &updatedDefect.Notes, &updatedDefect.ResolvedBy, &updatedDefect.ResolvedAt, &updatedDefect.CreatedAt, &updatedDefect.DueDate,
		&updatedDefect.IsNCR, &updatedDefect.NCRNumber, &updatedDefect.Assembler, &updatedDefect.Location, &updatedDefect.RootCause, &updatedDefect.CorrectiveAction, &updatedDefect.CloseoutDate, &updatedDefect.TeamLeadSignature,
		&updatedDefect.OrderNumber,
		&updatedDefect.AssignedUserName, &updatedDefect.CreatedByUserName, &updatedDefect.FixedByUserName, &updatedDefect.VerifiedByUserName,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update defect", err)
		return
	}

	BroadcastEvent("defect_updated", updatedDefect)
	slog.Debug("Defect updated", "defect_id", defectID, "status", updatedDefect.Status)

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
		respondError(w, http.StatusInternalServerError, "Failed to query defect summary", err)
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
			respondError(w, http.StatusInternalServerError, "Failed to scan summary row", err)
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

	respondJSON(w, http.StatusOK, summaries)
}

// handleGetAllDefectsSummary aggregates defect counts by department for all machines
func handleGetAllDefectsSummary(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT d.machine_id, d.assigned_department, d.status, d.severity, COUNT(*) 
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE (so.status IS NULL OR so.status != 'closed')
		GROUP BY d.machine_id, d.assigned_department, d.status, d.severity
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query all defect summaries", err)
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
			respondError(w, http.StatusInternalServerError, "Failed to scan summary row", err)
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
		respondError(w, http.StatusInternalServerError, "Failed to query machine defect summaries", err)
		return
	}
	defer rows.Close()

	summaryMap := make(map[uuid.UUID]*models.MachineDefectSummary)

	for rows.Next() {
		var machineID uuid.UUID
		var status string
		var count int

		if err := rows.Scan(&machineID, &status, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan machine summary row", err)
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
		respondError(w, http.StatusInternalServerError, "Failed to query project defect summaries", err)
		return
	}
	defer rows.Close()

	summaryMap := make(map[uuid.UUID]*models.ProjectDefectSummary)

	for rows.Next() {
		var salesOrderID uuid.UUID
		var status string
		var count int

		if err := rows.Scan(&salesOrderID, &status, &count); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan project summary row", err)
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
		respondError(w, http.StatusInternalServerError, "Failed to query project department defect summaries", err)
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
			respondError(w, http.StatusInternalServerError, "Failed to scan project department summary row", err)
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
		SourceDepartment   string  `json:"source_department"`
		AssignedDepartment string  `json:"assigned_department"`
		AssignedUserID     *string `json:"assigned_user_id"`
		Severity           string  `json:"severity"`
		Description        string  `json:"description"`
		Notes              *string `json:"notes"`
		DueDate            *string `json:"due_date"`

		// Optional NCR fields
		Assembler         *string `json:"assembler"`
		Location          *string `json:"location"`
		RootCause         *string `json:"root_cause"`
		CorrectiveAction  *string `json:"corrective_action"`
		CloseoutDate      *string `json:"closeout_date"`
		TeamLeadSignature *string `json:"team_lead_signature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if len(req.Description) > 255 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 255 characters", nil)
		return
	}

	if req.AssignedDepartment == "quality" {
		respondError(w, http.StatusBadRequest, "Defects cannot be assigned to the quality department", nil)
		return
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	}

	var updated models.Defect
	err = db.DB.QueryRow(`
		WITH updated AS (
			UPDATE defects 
			SET source_department = $2,
			    assigned_department = $3,
			    assigned_user_id = $4,
			    severity = $5,
			    description = $6,
			    notes = COALESCE($7, notes),
			    due_date = $8,
			    assembler = COALESCE($9, assembler),
			    location = COALESCE($10, location),
			    root_cause = COALESCE($11, root_cause),
			    corrective_action = COALESCE($12, corrective_action),
			    closeout_date = COALESCE($13, closeout_date),
			    team_lead_signature = COALESCE($14, team_lead_signature)
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
		)
		SELECT u_tbl.*, 
		       COALESCE(m.order_number, '') as order_number,
		       u.username as assigned_user_name, c.username as created_by_user_name, f.username as fixed_by_user_name, v.username as verified_by_user_name 
		FROM updated u_tbl 
		LEFT JOIN machines m ON u_tbl.machine_id = m.id
		LEFT JOIN users u ON u_tbl.assigned_user_id = u.id
		LEFT JOIN users c ON u_tbl.created_by_user_id = c.id
		LEFT JOIN users f ON u_tbl.fixed_by_user_id = f.id
		LEFT JOIN users v ON u_tbl.verified_by_user_id = v.id
	`, defectID, req.SourceDepartment, req.AssignedDepartment, assignedUserID, req.Severity, req.Description, req.Notes, parsedDueDate,
		req.Assembler, req.Location, req.RootCause, req.CorrectiveAction, parsedCloseoutDate, req.TeamLeadSignature,
	).Scan(
		&updated.ID, &updated.MachineID, &updated.SourceDepartment, &updated.AssignedDepartment, &updated.AssignedUserID, &updated.CreatedByUserID, &updated.FixedByUserID, &updated.VerifiedByUserID,
		&updated.Description, &updated.Severity, &updated.Status, &updated.Notes, &updated.ResolvedBy, &updated.ResolvedAt, &updated.CreatedAt, &updated.DueDate,
		&updated.IsNCR, &updated.NCRNumber, &updated.Assembler, &updated.Location, &updated.RootCause, &updated.CorrectiveAction, &updated.CloseoutDate, &updated.TeamLeadSignature,
		&updated.OrderNumber,
		&updated.AssignedUserName, &updated.CreatedByUserName, &updated.FixedByUserName, &updated.VerifiedByUserName,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update defect", err)
		return
	}

	BroadcastEvent("defect_updated", updated)

	respondJSON(w, http.StatusOK, updated)
}

// handleGetNCRs fetches all NCR defects with machine and project context
func handleGetNCRs(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	status := r.URL.Query().Get("status")
	machineID := r.URL.Query().Get("machine_id")

	query := `
		SELECT d.id, d.machine_id, d.source_department, d.assigned_department, d.assigned_user_id,
		       d.created_by_user_id, d.fixed_by_user_id, d.verified_by_user_id,
		       d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at, d.due_date,
		       d.is_ncr, d.ncr_number, d.assembler, d.location, d.root_cause, d.corrective_action, d.closeout_date, d.team_lead_signature,
		       u.username as assigned_user_name,
		       c.username as created_by_user_name,
		       f.username as fixed_by_user_name,
		       v.username as verified_by_user_name,
		       m.order_number,
		       so.internal_project_number,
		       so.project_name,
		       so.customer_name
		FROM defects d
		JOIN machines m ON d.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		LEFT JOIN users u ON d.assigned_user_id = u.id
		LEFT JOIN users c ON d.created_by_user_id = c.id
		LEFT JOIN users f ON d.fixed_by_user_id = f.id
		LEFT JOIN users v ON d.verified_by_user_id = v.id
		WHERE d.is_ncr = TRUE
	`
	var args []interface{}
	argIdx := 1

	if status != "" && status != "All" {
		query += fmt.Sprintf(" AND d.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	if machineID != "" {
		query += fmt.Sprintf(" AND d.machine_id = $%d", argIdx)
		args = append(args, machineID)
		argIdx++
	}

	if search != "" {
		searchPattern := "%" + search + "%"
		query += fmt.Sprintf(` AND (
			d.ncr_number ILIKE $%d OR
			m.order_number ILIKE $%d OR
			COALESCE(so.internal_project_number, '') ILIKE $%d OR
			COALESCE(so.project_name, '') ILIKE $%d OR
			COALESCE(d.assembler, '') ILIKE $%d OR
			COALESCE(d.location, '') ILIKE $%d OR
			d.description ILIKE $%d OR
			COALESCE(d.root_cause, '') ILIKE $%d
		)`, argIdx, argIdx, argIdx, argIdx, argIdx, argIdx, argIdx, argIdx)
		args = append(args, searchPattern)
	}

	query += " ORDER BY d.created_at DESC"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query NCRs", err)
		return
	}
	defer rows.Close()

	ncrs := []models.NCRDetail{}
	for rows.Next() {
		var ncr models.NCRDetail
		var assigned sql.NullString
		if err := rows.Scan(
			&ncr.ID, &ncr.MachineID, &ncr.SourceDepartment, &assigned, &ncr.AssignedUserID,
			&ncr.CreatedByUserID, &ncr.FixedByUserID, &ncr.VerifiedByUserID,
			&ncr.Description, &ncr.Severity, &ncr.Status, &ncr.Notes, &ncr.ResolvedBy, &ncr.ResolvedAt, &ncr.CreatedAt, &ncr.DueDate,
			&ncr.IsNCR, &ncr.NCRNumber, &ncr.Assembler, &ncr.Location, &ncr.RootCause, &ncr.CorrectiveAction, &ncr.CloseoutDate, &ncr.TeamLeadSignature,
			&ncr.AssignedUserName, &ncr.CreatedByUserName, &ncr.FixedByUserName, &ncr.VerifiedByUserName,
			&ncr.OrderNumber, &ncr.InternalProjectNumber, &ncr.ProjectName, &ncr.CustomerName,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan NCR", err)
			return
		}
		if assigned.Valid {
			ncr.AssignedDepartment = assigned.String
		}
		ncrs = append(ncrs, ncr)
	}

	respondJSON(w, http.StatusOK, ncrs)
}

// handleGetNextNCRNumber determines the next sequential NCR identifier
func handleGetNextNCRNumber(w http.ResponseWriter, r *http.Request) {
	nextNumber, err := generateNextNCRNumber()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to determine next NCR number", err)
		return
	}
	respondJSON(w, http.StatusOK, models.NextNCRNumberResponse{NextNumber: nextNumber})
}

// handleCreateNCR creates a full Non-Conformance Report tied to a machine
func handleCreateNCR(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MachineID           string  `json:"machine_id"`
		NCRNumber           *string `json:"ncr_number"`
		Assembler           string  `json:"assembler"`
		Location            string  `json:"location"`
		Description         string  `json:"description"`
		Severity            string  `json:"severity"`
		SourceDepartment    string  `json:"source_department"`
		AssignedDepartment  string  `json:"assigned_department"`
		AssignedUserID      *string `json:"assigned_user_id"`
		Notes               *string `json:"notes"`
		DueDate             *string `json:"due_date"`
		RootCause           *string `json:"root_cause"`
		CorrectiveAction    *string `json:"corrective_action"`
		CloseoutDate        *string `json:"closeout_date"`
		TeamLeadSignature   *string `json:"team_lead_signature"`
		SendNotification    bool    `json:"send_notification"`
		UpgradeFromDefectID *string `json:"upgrade_from_defect_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.MachineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	if req.Assembler == "" {
		respondError(w, http.StatusBadRequest, "Assembler name is required", nil)
		return
	}

	if req.Location == "" {
		respondError(w, http.StatusBadRequest, "Location of non-conformance is required", nil)
		return
	}

	if req.Description == "" {
		respondError(w, http.StatusBadRequest, "Description of defect is required", nil)
		return
	}

	if len(req.Description) > 255 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 255 characters", nil)
		return
	}

	if req.SourceDepartment == "" {
		req.SourceDepartment = "quality"
	}
	if req.AssignedDepartment == "" {
		req.AssignedDepartment = "assembly"
	}
	if req.Severity == "" {
		req.Severity = "moderate"
	}

	if req.NCRNumber == nil || *req.NCRNumber == "" {
		genNum, err := generateNextNCRNumber()
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to generate NCR number", err)
			return
		}
		req.NCRNumber = &genNum
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	}

	var notesVal string
	if req.Notes != nil {
		notesVal = *req.Notes
	}

	tx, err := db.DB.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to start database transaction", err)
		return
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var assignedUserEmail *string
	var machineOrderNumber string
	var openedByName string
	var ncr models.NCRDetail

	err = tx.QueryRowContext(r.Context(), `
		WITH inserted AS (
			INSERT INTO defects (
				machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id,
				description, severity, status, notes, due_date,
				is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
			)
			VALUES ($1, $2, $3, $4, NULLIF($8, '')::uuid, $5, $6, 'open', $7, $9, TRUE, $10, $11, $12, $13, $14, $15, $16)
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id,
			          description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
		)
		SELECT i.*,
		       u.username as assigned_user_name,
		       c.username as created_by_user_name,
		       f.username as fixed_by_user_name,
		       v.username as verified_by_user_name,
		       u.email as assigned_user_email,
		       COALESCE(m.order_number, '') as machine_order_number,
		       COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), c.username, 'System') as opened_by_name,
		       so.internal_project_number,
		       so.project_name,
		       so.customer_name
		FROM inserted i
		LEFT JOIN users u ON i.assigned_user_id = u.id
		LEFT JOIN users c ON i.created_by_user_id = c.id
		LEFT JOIN users f ON i.fixed_by_user_id = f.id
		LEFT JOIN users v ON i.verified_by_user_id = v.id
		LEFT JOIN machines m ON i.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
	`, req.MachineID, req.SourceDepartment, req.AssignedDepartment, assignedUserID, req.Description, req.Severity, notesVal, authUserID, parsedDueDate,
		req.NCRNumber, req.Assembler, req.Location, req.RootCause, req.CorrectiveAction, parsedCloseoutDate, req.TeamLeadSignature,
	).Scan(
		&ncr.ID, &ncr.MachineID, &ncr.SourceDepartment, &ncr.AssignedDepartment, &ncr.AssignedUserID, &ncr.CreatedByUserID, &ncr.FixedByUserID, &ncr.VerifiedByUserID,
		&ncr.Description, &ncr.Severity, &ncr.Status, &ncr.Notes, &ncr.ResolvedBy, &ncr.ResolvedAt, &ncr.CreatedAt, &ncr.DueDate,
		&ncr.IsNCR, &ncr.NCRNumber, &ncr.Assembler, &ncr.Location, &ncr.RootCause, &ncr.CorrectiveAction, &ncr.CloseoutDate, &ncr.TeamLeadSignature,
		&ncr.AssignedUserName, &ncr.CreatedByUserName, &ncr.FixedByUserName, &ncr.VerifiedByUserName,
		&assignedUserEmail, &machineOrderNumber, &openedByName,
		&ncr.InternalProjectNumber, &ncr.ProjectName, &ncr.CustomerName,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create NCR", err)
		return
	}
	ncr.OrderNumber = machineOrderNumber

	var oldDefectID string
	if req.UpgradeFromDefectID != nil && *req.UpgradeFromDefectID != "" {
		oldDefectID = *req.UpgradeFromDefectID

		// Re-link existing attachments to the newly created NCR
		if _, err := tx.ExecContext(r.Context(), `UPDATE attachments SET issue_id = $1 WHERE issue_id = $2`, ncr.ID, oldDefectID); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to migrate attachments to NCR", err)
			return
		}

		// Re-link machine_shop_tasks if any
		if _, err := tx.ExecContext(r.Context(), `UPDATE machine_shop_tasks SET defect_id = $1 WHERE defect_id = $2`, ncr.ID, oldDefectID); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to migrate machine shop tasks to NCR", err)
			return
		}

		// Re-link laser_tasks if any
		if _, err := tx.ExecContext(r.Context(), `UPDATE laser_tasks SET defect_id = $1 WHERE defect_id = $2`, ncr.ID, oldDefectID); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to migrate laser tasks to NCR", err)
			return
		}

		// Delete the original issue
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM defects WHERE id = $1`, oldDefectID); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to remove original defect", err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to commit NCR creation", err)
		return
	}

	if oldDefectID != "" {
		BroadcastEvent("defect_deleted", map[string]string{"id": oldDefectID})
		slog.Info("Upgraded issue to NCR", "old_defect_id", oldDefectID, "new_ncr_id", ncr.ID, "ncr_number", ncr.NCRNumber)
	}

	BroadcastEvent("defect_added", ncr.Defect)
	slog.Debug("NCR created", "defect_id", ncr.ID, "ncr_number", ncr.NCRNumber, "machine_id", req.MachineID)

	if req.SendNotification {
		dispatchDefectNotification(r.Context(), ncr.Defect, assignedUserEmail, machineOrderNumber, openedByName)
	}

	respondJSON(w, http.StatusCreated, ncr)
}

// handleUpdateNCR updates NCR details, closeout fields, and status
func handleUpdateNCR(w http.ResponseWriter, r *http.Request) {
	ncrID := r.PathValue("id")
	if ncrID == "" {
		respondError(w, http.StatusBadRequest, "NCR ID is required", nil)
		return
	}

	var req struct {
		Status             *string `json:"status"`
		Assembler          *string `json:"assembler"`
		Location           *string `json:"location"`
		Description        *string `json:"description"`
		Severity           *string `json:"severity"`
		Notes              *string `json:"notes"`
		AssignedDepartment *string `json:"assigned_department"`
		AssignedUserID     *string `json:"assigned_user_id"`
		DueDate            *string `json:"due_date"`
		RootCause          *string `json:"root_cause"`
		CorrectiveAction   *string `json:"corrective_action"`
		CloseoutDate       *string `json:"closeout_date"`
		TeamLeadSignature  *string `json:"team_lead_signature"`
		SendNotification   bool    `json:"send_notification"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.Description != nil && len(*req.Description) > 255 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 255 characters", nil)
		return
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var assignedUserID interface{}
	if req.AssignedUserID != nil && *req.AssignedUserID != "" {
		assignedUserID = *req.AssignedUserID
	}

	var statusVal string
	if req.Status != nil {
		statusVal = *req.Status
	}

	var assignedUserEmail *string
	var openedByName string
	var ncr models.NCRDetail

	err = db.DB.QueryRow(`
		WITH updated AS (
			UPDATE defects
			SET assembler = COALESCE($2, assembler),
			    location = COALESCE($3, location),
			    description = COALESCE($4, description),
			    severity = COALESCE($5, severity),
			    notes = COALESCE($6, notes),
			    assigned_department = COALESCE(NULLIF($7, ''), assigned_department),
			    assigned_user_id = CASE WHEN $8::text IS NOT NULL THEN NULLIF($8, '')::uuid ELSE assigned_user_id END,
			    due_date = COALESCE($9, due_date),
			    root_cause = COALESCE($10, root_cause),
			    corrective_action = COALESCE($11, corrective_action),
			    closeout_date = COALESCE($12, closeout_date),
			    team_lead_signature = COALESCE($13, team_lead_signature),
			    status = COALESCE(NULLIF($14, ''), status),
			    resolved_at = CASE
			        WHEN $14 IN ('fixed', 'verified') THEN NOW()
			        WHEN $14 = 'open' THEN NULL
			        ELSE resolved_at
			    END,
			    resolved_by = CASE
			        WHEN $14 IN ('fixed', 'verified') THEN 'user_quality_01'
			        WHEN $14 = 'open' THEN NULL
			        ELSE resolved_by
			    END,
			    fixed_by_user_id = CASE
			        WHEN $14 = 'fixed' THEN NULLIF($15, '')::uuid
			        WHEN $14 = 'open' THEN NULL
			        ELSE fixed_by_user_id
			    END,
			    verified_by_user_id = CASE
			        WHEN $14 = 'verified' THEN NULLIF($15, '')::uuid
			        WHEN $14 = 'open' THEN NULL
			        ELSE verified_by_user_id
			    END
			WHERE id = $1 AND is_ncr = TRUE
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id,
			          description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
		)
		SELECT u_tbl.*,
		       u.username as assigned_user_name,
		       c.username as created_by_user_name,
		       f.username as fixed_by_user_name,
		       v.username as verified_by_user_name,
		       u.email as assigned_user_email,
		       COALESCE(NULLIF(TRIM(CONCAT(auth_user.first_name, ' ', auth_user.last_name)), ''), auth_user.username, 'System') as opened_by_name,
		       m.order_number,
		       so.internal_project_number,
		       so.project_name,
		       so.customer_name
		FROM updated u_tbl
		LEFT JOIN users u ON u_tbl.assigned_user_id = u.id
		LEFT JOIN users c ON u_tbl.created_by_user_id = c.id
		LEFT JOIN users f ON u_tbl.fixed_by_user_id = f.id
		LEFT JOIN users v ON u_tbl.verified_by_user_id = v.id
		LEFT JOIN users auth_user ON NULLIF($15, '')::uuid = auth_user.id
		LEFT JOIN machines m ON u_tbl.machine_id = m.id
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
	`, ncrID, req.Assembler, req.Location, req.Description, req.Severity, req.Notes,
		req.AssignedDepartment, assignedUserID, parsedDueDate, req.RootCause, req.CorrectiveAction,
		parsedCloseoutDate, req.TeamLeadSignature, statusVal, authUserID,
	).Scan(
		&ncr.ID, &ncr.MachineID, &ncr.SourceDepartment, &ncr.AssignedDepartment, &ncr.AssignedUserID,
		&ncr.CreatedByUserID, &ncr.FixedByUserID, &ncr.VerifiedByUserID,
		&ncr.Description, &ncr.Severity, &ncr.Status, &ncr.Notes, &ncr.ResolvedBy, &ncr.ResolvedAt, &ncr.CreatedAt, &ncr.DueDate,
		&ncr.IsNCR, &ncr.NCRNumber, &ncr.Assembler, &ncr.Location, &ncr.RootCause, &ncr.CorrectiveAction, &ncr.CloseoutDate, &ncr.TeamLeadSignature,
		&ncr.AssignedUserName, &ncr.CreatedByUserName, &ncr.FixedByUserName, &ncr.VerifiedByUserName,
		&assignedUserEmail, &openedByName,
		&ncr.OrderNumber, &ncr.InternalProjectNumber, &ncr.ProjectName, &ncr.CustomerName,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update NCR", err)
		return
	}

	BroadcastEvent("defect_updated", ncr.Defect)
	slog.Debug("NCR updated", "defect_id", ncrID, "status", ncr.Status)

	if req.SendNotification {
		dispatchDefectNotification(r.Context(), ncr.Defect, assignedUserEmail, ncr.OrderNumber, openedByName)
	}

	respondJSON(w, http.StatusOK, ncr)
}
