package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

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

	if len(req.Description) > 4000 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 4000 characters", nil)
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
	} else if req.TeamLeadSignature != nil && strings.TrimSpace(*req.TeamLeadSignature) != "" {
		sig := strings.TrimSpace(*req.TeamLeadSignature)
		var matchedID string
		if err := db.DB.QueryRowContext(r.Context(), `
			SELECT id FROM users
			WHERE TRIM(CONCAT(first_name, ' ', last_name)) = $1
			   OR username = $1
			   OR email = $1
			LIMIT 1
		`, sig).Scan(&matchedID); err == nil && matchedID != "" {
			assignedUserID = matchedID
		}
	} else if req.UpgradeFromDefectID != nil && strings.TrimSpace(*req.UpgradeFromDefectID) != "" {
		var origAssignedID sql.NullString
		if err := db.DB.QueryRowContext(r.Context(), `SELECT assigned_user_id FROM defects WHERE id = $1`, strings.TrimSpace(*req.UpgradeFromDefectID)).Scan(&origAssignedID); err == nil && origAssignedID.Valid && origAssignedID.String != "" {
			assignedUserID = origAssignedID.String
		}
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
	var updatedOldDefect models.Defect
	if req.UpgradeFromDefectID != nil && *req.UpgradeFromDefectID != "" {
		oldDefectID = *req.UpgradeFromDefectID

		// Copy existing attachments from original issue to the newly created NCR
		attRows, err := tx.QueryContext(r.Context(), `SELECT id, filename, mime_type, byte_size, metadata FROM attachments WHERE issue_id = $1`, oldDefectID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to query attachments for NCR", err)
			return
		}
		type attCopyItem struct {
			oldID    string
			filename string
			mimeType string
			byteSize int64
			metadata []byte
		}
		var attsToCopy []attCopyItem
		for attRows.Next() {
			var item attCopyItem
			if err := attRows.Scan(&item.oldID, &item.filename, &item.mimeType, &item.byteSize, &item.metadata); err == nil {
				attsToCopy = append(attsToCopy, item)
			}
		}
		attRows.Close()

		storageDir := getAttachmentsDir()
		dstDir := filepath.Join(storageDir, ncr.ID.String())

		for _, item := range attsToCopy {
			newID := uuid.New().String()
			ext := filepath.Ext(item.filename)
			srcFile := filepath.Join(storageDir, oldDefectID, item.oldID+ext)
			dstFile := filepath.Join(dstDir, newID+ext)

			if srcBytes, err := os.ReadFile(srcFile); err == nil {
				_ = os.MkdirAll(dstDir, 0755)
				_ = os.WriteFile(dstFile, srcBytes, 0644)
			}

			if _, err := tx.ExecContext(r.Context(), `
				INSERT INTO attachments (id, issue_id, filename, mime_type, byte_size, metadata)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, newID, ncr.ID, item.filename, item.mimeType, item.byteSize, item.metadata); err != nil {
				respondError(w, http.StatusInternalServerError, "Failed to copy attachment to NCR", err)
				return
			}
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

		// Mark the original issue as signed off and Verified/Cleared
		ncrNumDisplay := "NCR"
		if ncr.NCRNumber != nil && *ncr.NCRNumber != "" {
			ncrNumDisplay = *ncr.NCRNumber
		}
		auditNote := fmt.Sprintf("[Verified/Cleared: Upgraded to %s]", ncrNumDisplay)

		err = tx.QueryRowContext(r.Context(), `
			WITH updated AS (
				UPDATE defects
				SET status = 'verified',
				    resolved_at = NOW(),
				    resolved_by = COALESCE(
				        (SELECT NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), '') FROM users WHERE id = NULLIF($2, '')::uuid),
				        (SELECT username FROM users WHERE id = NULLIF($2, '')::uuid),
				        'Manager'
				    ),
				    verified_by_user_id = NULLIF($2, '')::uuid,
				    notes = CASE 
				        WHEN notes IS NULL OR TRIM(notes) = '' THEN $3
				        ELSE notes || E'\n\n' || $3
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
		`, oldDefectID, authUserID, auditNote).Scan(
			&updatedOldDefect.ID, &updatedOldDefect.MachineID, &updatedOldDefect.SourceDepartment, &updatedOldDefect.AssignedDepartment, &updatedOldDefect.AssignedUserID, &updatedOldDefect.CreatedByUserID, &updatedOldDefect.FixedByUserID, &updatedOldDefect.VerifiedByUserID, &updatedOldDefect.Description, &updatedOldDefect.Severity, &updatedOldDefect.Status, &updatedOldDefect.Notes, &updatedOldDefect.ResolvedBy, &updatedOldDefect.ResolvedAt, &updatedOldDefect.CreatedAt, &updatedOldDefect.DueDate,
			&updatedOldDefect.IsNCR, &updatedOldDefect.NCRNumber, &updatedOldDefect.Assembler, &updatedOldDefect.Location, &updatedOldDefect.RootCause, &updatedOldDefect.CorrectiveAction, &updatedOldDefect.CloseoutDate, &updatedOldDefect.TeamLeadSignature,
			&updatedOldDefect.OrderNumber,
			&updatedOldDefect.AssignedUserName, &updatedOldDefect.CreatedByUserName, &updatedOldDefect.FixedByUserName, &updatedOldDefect.VerifiedByUserName,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to sign off and verify original defect", err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to commit NCR creation", err)
		return
	}

	if oldDefectID != "" {
		BroadcastEvent("defect_updated", updatedOldDefect)
		slog.Info("Upgraded issue to NCR and marked original issue verified", "old_defect_id", oldDefectID, "new_ncr_id", ncr.ID, "ncr_number", ncr.NCRNumber)
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

	if req.Description != nil && len(*req.Description) > 4000 {
		respondError(w, http.StatusBadRequest, "Description exceeds maximum length of 4000 characters", nil)
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
	} else if req.TeamLeadSignature != nil && strings.TrimSpace(*req.TeamLeadSignature) != "" {
		sig := strings.TrimSpace(*req.TeamLeadSignature)
		var matchedID string
		if err := db.DB.QueryRowContext(r.Context(), `
			SELECT id FROM users
			WHERE TRIM(CONCAT(first_name, ' ', last_name)) = $1
			   OR username = $1
			   OR email = $1
			LIMIT 1
		`, sig).Scan(&matchedID); err == nil && matchedID != "" {
			assignedUserID = matchedID
		}
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
			        WHEN $14 IN ('fixed', 'verified') THEN COALESCE(
			            (SELECT NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), '') FROM users WHERE id = NULLIF($15, '')::uuid),
			            (SELECT username FROM users WHERE id = NULLIF($15, '')::uuid),
			            'System'
			        )
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
