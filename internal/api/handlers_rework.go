package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetReworkItems fetches rework items with rich joins on sales orders, machines, and users
func handleGetReworkItems(w http.ResponseWriter, r *http.Request) {
	salesOrderID := r.URL.Query().Get("sales_order_id")
	machineID := r.URL.Query().Get("machine_id")
	status := r.URL.Query().Get("status")
	view := r.URL.Query().Get("view") // "active" or "complete"
	partType := r.URL.Query().Get("part_type")

	query := `
		SELECT 
			r.id, r.sales_order_id, so.project_name, so.customer_name,
			r.machine_id, m.order_number,
			r.defect_id, COALESCE(d.is_ncr, false) as is_ncr, d.ncr_number,
			r.project_number, r.sub_assembly, r.part_number, r.description,
			r.revision, r.material, r.qty, r.part_type,
			r.mech_designer_id, des.username as mech_designer_name,
			r.date_released_from_mech_design,
			r.pm_released_to_id, pm.username as pm_released_to_name,
			r.pdm_vault_released,
			r.reason_for_rework, r.date_released_to_mfg, r.requested_completion_date,
			r.pm_delivered_to, r.pm_date_delivered,
			r.expected_completion_date, r.material_ordered_date,
			r.assigned_machinist_id, mach.username as assigned_machinist_name,
			r.date_mfg_completed, r.part_given_to_or_left_at, r.is_after_hours_drop,
			r.estimated_hours, r.actual_hours,
			r.requires_outside_processing, r.outside_vendor,
			r.date_sent_for_processing, r.date_expected_from_processing, r.date_received_from_processing,
			r.kitting_delivered_to, r.kitting_date_delivered,
			r.status,
			r.assembler_id, asm.username as assembler_name,
			r.parts_collected_by_pm, r.is_assembler_self_modified,
			r.completed_at, r.completed_by_id, comp.username as completed_by_name,
			r.created_at, r.updated_at
		FROM rework_items r
		JOIN sales_orders so ON r.sales_order_id = so.id
		LEFT JOIN machines m ON r.machine_id = m.id
		LEFT JOIN defects d ON r.defect_id = d.id
		LEFT JOIN users des ON r.mech_designer_id = des.id
		LEFT JOIN users pm ON r.pm_released_to_id = pm.id
		LEFT JOIN users mach ON r.assigned_machinist_id = mach.id
		LEFT JOIN users asm ON r.assembler_id = asm.id
		LEFT JOIN users comp ON r.completed_by_id = comp.id
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if salesOrderID != "" {
		query += fmt.Sprintf(" AND r.sales_order_id = $%d", argIdx)
		args = append(args, salesOrderID)
		argIdx++
	}
	if machineID != "" {
		query += fmt.Sprintf(" AND r.machine_id = $%d", argIdx)
		args = append(args, machineID)
		argIdx++
	}
	if partType != "" {
		query += fmt.Sprintf(" AND r.part_type = $%d", argIdx)
		args = append(args, partType)
		argIdx++
	}
	if status != "" {
		query += fmt.Sprintf(" AND r.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	} else if view == "active" {
		query += " AND r.status != 'complete' AND r.status != 'cancelled'"
	} else if view == "complete" {
		query += " AND r.status = 'complete'"
	}

	query += " ORDER BY r.created_at DESC"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}
	defer rows.Close()

	items := []models.ReworkItem{}
	for rows.Next() {
		var it models.ReworkItem
		var reqCompDate, expCompDate, matOrdDate sql.NullString
		var dtSentProc, dtExpProc, dtRecvProc sql.NullString

		if err := rows.Scan(
			&it.ID, &it.SalesOrderID, &it.ProjectName, &it.CustomerName,
			&it.MachineID, &it.OrderNumber,
			&it.DefectID, &it.IsNCR, &it.NCRNumber,
			&it.ProjectNumber, &it.SubAssembly, &it.PartNumber, &it.Description,
			&it.Revision, &it.Material, &it.Qty, &it.PartType,
			&it.MechDesignerID, &it.MechDesignerName,
			&it.DateReleasedFromMechDesign,
			&it.PMReleasedToID, &it.PMReleasedToName,
			&it.PDMVaultReleased,
			&it.ReasonForRework, &it.DateReleasedToMfg, &reqCompDate,
			&it.PMDeliveredTo, &it.PMDateDelivered,
			&expCompDate, &matOrdDate,
			&it.AssignedMachinistID, &it.AssignedMachinistName,
			&it.DateMfgCompleted, &it.PartGivenToOrLeftAt, &it.IsAfterHoursDrop,
			&it.EstimatedHours, &it.ActualHours,
			&it.RequiresOutsideProcessing, &it.OutsideVendor,
			&dtSentProc, &dtExpProc, &dtRecvProc,
			&it.KittingDeliveredTo, &it.KittingDateDelivered,
			&it.Status,
			&it.AssemblerID, &it.AssemblerName,
			&it.PartsCollectedByPM, &it.IsAssemblerSelfModified,
			&it.CompletedAt, &it.CompletedByID, &it.CompletedByName,
			&it.CreatedAt, &it.UpdatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning rework item", err)
			return
		}

		if reqCompDate.Valid {
			it.RequestedCompletionDate = &reqCompDate.String
		}
		if expCompDate.Valid {
			it.ExpectedCompletionDate = &expCompDate.String
		}
		if matOrdDate.Valid {
			it.MaterialOrderedDate = &matOrdDate.String
		}
		if dtSentProc.Valid {
			it.DateSentForProcessing = &dtSentProc.String
		}
		if dtExpProc.Valid {
			it.DateExpectedFromProcessing = &dtExpProc.String
		}
		if dtRecvProc.Valid {
			it.DateReceivedFromProcessing = &dtRecvProc.String
		}

		items = append(items, it)
	}

	respondJSON(w, http.StatusOK, items)
}

// handleGetReworkItemByID retrieves a single rework item
func handleGetReworkItemByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	query := `
		SELECT 
			r.id, r.sales_order_id, so.project_name, so.customer_name,
			r.machine_id, m.order_number,
			r.defect_id, COALESCE(d.is_ncr, false) as is_ncr, d.ncr_number,
			r.project_number, r.sub_assembly, r.part_number, r.description,
			r.revision, r.material, r.qty, r.part_type,
			r.mech_designer_id, des.username as mech_designer_name,
			r.date_released_from_mech_design,
			r.pm_released_to_id, pm.username as pm_released_to_name,
			r.pdm_vault_released,
			r.reason_for_rework, r.date_released_to_mfg, r.requested_completion_date,
			r.pm_delivered_to, r.pm_date_delivered,
			r.expected_completion_date, r.material_ordered_date,
			r.assigned_machinist_id, mach.username as assigned_machinist_name,
			r.date_mfg_completed, r.part_given_to_or_left_at, r.is_after_hours_drop,
			r.estimated_hours, r.actual_hours,
			r.requires_outside_processing, r.outside_vendor,
			r.date_sent_for_processing, r.date_expected_from_processing, r.date_received_from_processing,
			r.kitting_delivered_to, r.kitting_date_delivered,
			r.status,
			r.assembler_id, asm.username as assembler_name,
			r.parts_collected_by_pm, r.is_assembler_self_modified,
			r.completed_at, r.completed_by_id, comp.username as completed_by_name,
			r.created_at, r.updated_at
		FROM rework_items r
		JOIN sales_orders so ON r.sales_order_id = so.id
		LEFT JOIN machines m ON r.machine_id = m.id
		LEFT JOIN defects d ON r.defect_id = d.id
		LEFT JOIN users des ON r.mech_designer_id = des.id
		LEFT JOIN users pm ON r.pm_released_to_id = pm.id
		LEFT JOIN users mach ON r.assigned_machinist_id = mach.id
		LEFT JOIN users asm ON r.assembler_id = asm.id
		LEFT JOIN users comp ON r.completed_by_id = comp.id
		WHERE r.id = $1
	`

	var it models.ReworkItem
	var reqCompDate, expCompDate, matOrdDate sql.NullString
	var dtSentProc, dtExpProc, dtRecvProc sql.NullString

	err := db.DB.QueryRow(query, id).Scan(
		&it.ID, &it.SalesOrderID, &it.ProjectName, &it.CustomerName,
		&it.MachineID, &it.OrderNumber,
		&it.DefectID, &it.IsNCR, &it.NCRNumber,
		&it.ProjectNumber, &it.SubAssembly, &it.PartNumber, &it.Description,
		&it.Revision, &it.Material, &it.Qty, &it.PartType,
		&it.MechDesignerID, &it.MechDesignerName,
		&it.DateReleasedFromMechDesign,
		&it.PMReleasedToID, &it.PMReleasedToName,
		&it.PDMVaultReleased,
		&it.ReasonForRework, &it.DateReleasedToMfg, &reqCompDate,
		&it.PMDeliveredTo, &it.PMDateDelivered,
		&expCompDate, &matOrdDate,
		&it.AssignedMachinistID, &it.AssignedMachinistName,
		&it.DateMfgCompleted, &it.PartGivenToOrLeftAt, &it.IsAfterHoursDrop,
		&it.EstimatedHours, &it.ActualHours,
		&it.RequiresOutsideProcessing, &it.OutsideVendor,
		&dtSentProc, &dtExpProc, &dtRecvProc,
		&it.KittingDeliveredTo, &it.KittingDateDelivered,
		&it.Status,
		&it.AssemblerID, &it.AssemblerName,
		&it.PartsCollectedByPM, &it.IsAssemblerSelfModified,
		&it.CompletedAt, &it.CompletedByID, &it.CompletedByName,
		&it.CreatedAt, &it.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Rework item not found", nil)
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	if reqCompDate.Valid {
		it.RequestedCompletionDate = &reqCompDate.String
	}
	if expCompDate.Valid {
		it.ExpectedCompletionDate = &expCompDate.String
	}
	if matOrdDate.Valid {
		it.MaterialOrderedDate = &matOrdDate.String
	}
	if dtSentProc.Valid {
		it.DateSentForProcessing = &dtSentProc.String
	}
	if dtExpProc.Valid {
		it.DateExpectedFromProcessing = &dtExpProc.String
	}
	if dtRecvProc.Valid {
		it.DateReceivedFromProcessing = &dtRecvProc.String
	}

	respondJSON(w, http.StatusOK, it)
}

// handleCreateReworkItem creates a new rework ticket (SOP 1-003 Step 1 or Defect/NCR escalation)
func handleCreateReworkItem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SalesOrderID               *string  `json:"sales_order_id"`
		MachineID                  *string  `json:"machine_id"`
		DefectID                   *string  `json:"defect_id"`
		ProjectNumber              string   `json:"project_number"`
		SubAssembly                *string  `json:"sub_assembly"`
		PartNumber                 string   `json:"part_number"`
		Description                string   `json:"description"`
		Revision                   string   `json:"revision"`
		Material                   string   `json:"material"`
		Qty                        int      `json:"qty"`
		PartType                   string   `json:"part_type"` // 'NEW' or 'MOD'
		MechDesignerID             *string  `json:"mech_designer_id"`
		DateReleasedFromMechDesign *string  `json:"date_released_from_mech_design"`
		PMReleasedToID             *string  `json:"pm_released_to_id"`
		PDMVaultReleased           bool     `json:"pdm_vault_released"`
		ReasonForRework            string   `json:"reason_for_rework"`
		EstimatedHours             *float64 `json:"estimated_hours"`
		AssemblerID                *string  `json:"assembler_id"`
		IsAssemblerSelfModified    bool     `json:"is_assembler_self_modified"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.PartNumber == "" || req.Description == "" || req.Revision == "" || req.Material == "" {
		respondError(w, http.StatusBadRequest, "Part number, description, revision, and material are required", nil)
		return
	}

	if req.Qty <= 0 {
		req.Qty = 1
	}
	if req.PartType == "" {
		req.PartType = "NEW"
	}
	if req.PartType != "NEW" && req.PartType != "MOD" {
		respondError(w, http.StatusBadRequest, "part_type must be 'NEW' or 'MOD'", nil)
		return
	}

	// Resolve SalesOrderID if only machine_id or defect_id was provided
	resolvedSOID := ""
	if req.SalesOrderID != nil && *req.SalesOrderID != "" {
		resolvedSOID = *req.SalesOrderID
	}

	if resolvedSOID == "" && req.MachineID != nil && *req.MachineID != "" {
		_ = db.DB.QueryRow("SELECT sales_order_id FROM machines WHERE id = $1", *req.MachineID).Scan(&resolvedSOID)
	}

	if resolvedSOID == "" && req.DefectID != nil && *req.DefectID != "" {
		_ = db.DB.QueryRow(`
			SELECT m.sales_order_id 
			FROM defects d 
			JOIN machines m ON d.machine_id = m.id 
			WHERE d.id = $1
		`, *req.DefectID).Scan(&resolvedSOID)
	}

	if resolvedSOID == "" {
		respondError(w, http.StatusBadRequest, "Sales Order ID is required or must be inferrable from machine or defect", nil)
		return
	}

	// Auto-infer Project Number if blank
	if req.ProjectNumber == "" {
		var autoProj sql.NullString
		_ = db.DB.QueryRow(`
			SELECT COALESCE(so.internal_project_number, so.po_number, 'PROJ') 
			FROM sales_orders so 
			WHERE so.id = $1
		`, resolvedSOID).Scan(&autoProj)
		if autoProj.Valid {
			req.ProjectNumber = autoProj.String
		} else {
			req.ProjectNumber = "PROJ"
		}
	}

	authUserID := getAuthenticatedUserID(r)
	designerID := req.MechDesignerID
	if (designerID == nil || *designerID == "") && authUserID != "" {
		designerID = &authUserID
	}

	estHours := 0.0
	if req.EstimatedHours != nil {
		estHours = *req.EstimatedHours
	}

	status := "design_draft"
	if req.PMReleasedToID != nil && *req.PMReleasedToID != "" {
		status = "released_to_pm"
	}
	if req.IsAssemblerSelfModified {
		status = "complete"
	}

	var newID uuid.UUID
	err := db.DB.QueryRow(`
		INSERT INTO rework_items (
			sales_order_id, machine_id, defect_id, project_number, sub_assembly,
			part_number, description, revision, material, qty, part_type,
			mech_designer_id, date_released_from_mech_design, pm_released_to_id, pdm_vault_released,
			reason_for_rework, estimated_hours, assembler_id, is_assembler_self_modified, status
		)
		VALUES (
			$1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5,
			$6, $7, $8, $9, $10, $11,
			NULLIF($12, '')::uuid, CASE WHEN $13 = '' THEN NOW() ELSE $13::timestamptz END, NULLIF($14, '')::uuid, $15,
			$16, $17, NULLIF($18, '')::uuid, $19, $20
		)
		RETURNING id
	`,
		resolvedSOID,
		nilIfEmpty(req.MachineID),
		nilIfEmpty(req.DefectID),
		req.ProjectNumber,
		req.SubAssembly,
		req.PartNumber,
		req.Description,
		req.Revision,
		req.Material,
		req.Qty,
		req.PartType,
		designerID,
		defaultStr(req.DateReleasedFromMechDesign, time.Now().Format(time.RFC3339)),
		nilIfEmpty(req.PMReleasedToID),
		req.PDMVaultReleased,
		req.ReasonForRework,
		estHours,
		nilIfEmpty(req.AssemblerID),
		req.IsAssemblerSelfModified,
		status,
	).Scan(&newID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create rework item", err)
		return
	}

	slog.Info("Rework item created", "rework_id", newID, "project_number", req.ProjectNumber, "part_type", req.PartType)

	// Fetch full entity for broadcast & return
	createdItem, err := fetchReworkItemByID(newID)
	if err == nil {
		BroadcastEvent("rework_created", createdItem)
	}

	respondJSON(w, http.StatusCreated, createdItem)
}

// handleUpdateReworkItem updates fields as the component moves across departments (SOP steps 2-5)
func handleUpdateReworkItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	var req struct {
		ProjectNumber              *string  `json:"project_number"`
		SubAssembly                *string  `json:"sub_assembly"`
		PartNumber                 *string  `json:"part_number"`
		Description                *string  `json:"description"`
		Revision                   *string  `json:"revision"`
		Material                   *string  `json:"material"`
		Qty                        *int     `json:"qty"`
		PartType                   *string  `json:"part_type"`
		PDMVaultReleased           *bool    `json:"pdm_vault_released"`
		ReasonForRework            *string  `json:"reason_for_rework"`
		PMReleasedToID             *string  `json:"pm_released_to_id"`
		DateReleasedToMfg          *string  `json:"date_released_to_mfg"`
		RequestedCompletionDate    *string  `json:"requested_completion_date"`
		PMDeliveredTo              *string  `json:"pm_delivered_to"`
		ExpectedCompletionDate     *string  `json:"expected_completion_date"`
		MaterialOrderedDate        *string  `json:"material_ordered_date"`
		AssignedMachinistID        *string  `json:"assigned_machinist_id"`
		DateMfgCompleted           *string  `json:"date_mfg_completed"`
		PartGivenToOrLeftAt        *string  `json:"part_given_to_or_left_at"`
		EstimatedHours             *float64 `json:"estimated_hours"`
		ActualHours                *float64 `json:"actual_hours"`
		RequiresOutsideProcessing  *bool    `json:"requires_outside_processing"`
		OutsideVendor              *string  `json:"outside_vendor"`
		DateSentForProcessing      *string  `json:"date_sent_for_processing"`
		DateExpectedFromProcessing *string  `json:"date_expected_from_processing"`
		DateReceivedFromProcessing *string  `json:"date_received_from_processing"`
		KittingDeliveredTo         *string  `json:"kitting_delivered_to"`
		Status                     *string  `json:"status"`
		PartsCollectedByPM         *bool    `json:"parts_collected_by_pm"`
		AssemblerID                *string  `json:"assembler_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Fetch current item to manage status transitions
	existing, err := fetchReworkItemByID(uuid.MustParse(id))
	if err != nil {
		respondError(w, http.StatusNotFound, "Rework item not found", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	if req.ProjectNumber != nil {
		existing.ProjectNumber = *req.ProjectNumber
	}
	if req.SubAssembly != nil {
		existing.SubAssembly = req.SubAssembly
	}
	if req.PartNumber != nil {
		existing.PartNumber = *req.PartNumber
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Revision != nil {
		existing.Revision = *req.Revision
	}
	if req.Material != nil {
		existing.Material = *req.Material
	}
	if req.Qty != nil {
		existing.Qty = *req.Qty
	}
	if req.PartType != nil {
		existing.PartType = *req.PartType
	}
	if req.PDMVaultReleased != nil {
		existing.PDMVaultReleased = *req.PDMVaultReleased
	}
	if req.ReasonForRework != nil {
		existing.ReasonForRework = *req.ReasonForRework
	}
	if req.PMReleasedToID != nil {
		if *req.PMReleasedToID != "" {
			u, err := uuid.Parse(*req.PMReleasedToID)
			if err == nil {
				existing.PMReleasedToID = &u
			}
		} else {
			existing.PMReleasedToID = nil
		}
	}
	if req.DateReleasedToMfg != nil {
		if *req.DateReleasedToMfg != "" {
			t, err := time.Parse(time.RFC3339, *req.DateReleasedToMfg)
			if err == nil {
				existing.DateReleasedToMfg = &t
			}
		} else {
			existing.DateReleasedToMfg = nil
		}
	}
	if req.RequestedCompletionDate != nil {
		existing.RequestedCompletionDate = req.RequestedCompletionDate
	}
	if req.PMDeliveredTo != nil {
		existing.PMDeliveredTo = req.PMDeliveredTo
	}
	if req.ExpectedCompletionDate != nil {
		existing.ExpectedCompletionDate = req.ExpectedCompletionDate
	}
	if req.MaterialOrderedDate != nil {
		existing.MaterialOrderedDate = req.MaterialOrderedDate
	}
	if req.AssignedMachinistID != nil {
		if *req.AssignedMachinistID != "" {
			u, err := uuid.Parse(*req.AssignedMachinistID)
			if err == nil {
				existing.AssignedMachinistID = &u
			}
		} else {
			existing.AssignedMachinistID = nil
		}
	}
	if req.DateMfgCompleted != nil {
		if *req.DateMfgCompleted != "" {
			t, err := time.Parse(time.RFC3339, *req.DateMfgCompleted)
			if err == nil {
				existing.DateMfgCompleted = &t
			}
		} else {
			existing.DateMfgCompleted = nil
		}
	}
	if req.PartGivenToOrLeftAt != nil {
		existing.PartGivenToOrLeftAt = req.PartGivenToOrLeftAt
	}
	if req.EstimatedHours != nil {
		existing.EstimatedHours = *req.EstimatedHours
	}
	if req.ActualHours != nil {
		existing.ActualHours = *req.ActualHours
	}
	if req.RequiresOutsideProcessing != nil {
		existing.RequiresOutsideProcessing = *req.RequiresOutsideProcessing
	}
	if req.OutsideVendor != nil {
		existing.OutsideVendor = req.OutsideVendor
	}
	if req.DateSentForProcessing != nil {
		existing.DateSentForProcessing = req.DateSentForProcessing
	}
	if req.DateExpectedFromProcessing != nil {
		existing.DateExpectedFromProcessing = req.DateExpectedFromProcessing
	}
	if req.DateReceivedFromProcessing != nil {
		existing.DateReceivedFromProcessing = req.DateReceivedFromProcessing
	}
	if req.KittingDeliveredTo != nil {
		existing.KittingDeliveredTo = req.KittingDeliveredTo
	}
	if req.Status != nil && *req.Status != "" {
		existing.Status = *req.Status
	}
	if req.PartsCollectedByPM != nil {
		existing.PartsCollectedByPM = *req.PartsCollectedByPM
	}
	if req.AssemblerID != nil {
		if *req.AssemblerID != "" {
			u, err := uuid.Parse(*req.AssemblerID)
			if err == nil {
				existing.AssemblerID = &u
			}
		} else {
			existing.AssemblerID = nil
		}
	}
	if existing.Status == "complete" && existing.CompletedAt == nil {
		now := time.Now()
		existing.CompletedAt = &now
		if authUserID != "" {
			u, err := uuid.Parse(authUserID)
			if err == nil {
				existing.CompletedByID = &u
			}
		}
	}

	// Execute direct update
	_, err = db.DB.Exec(`
		UPDATE rework_items SET
			project_number = $2,
			sub_assembly = $3,
			part_number = $4,
			description = $5,
			revision = $6,
			material = $7,
			qty = $8,
			part_type = $9,
			pdm_vault_released = $10,
			reason_for_rework = $11,
			pm_released_to_id = $12,
			date_released_to_mfg = $13,
			requested_completion_date = NULLIF($14, '')::date,
			pm_delivered_to = $15,
			expected_completion_date = NULLIF($16, '')::date,
			material_ordered_date = NULLIF($17, '')::date,
			assigned_machinist_id = $18,
			date_mfg_completed = $19,
			part_given_to_or_left_at = $20,
			estimated_hours = $21,
			actual_hours = $22,
			requires_outside_processing = $23,
			outside_vendor = $24,
			date_sent_for_processing = NULLIF($25, '')::date,
			date_expected_from_processing = NULLIF($26, '')::date,
			date_received_from_processing = NULLIF($27, '')::date,
			kitting_delivered_to = $28,
			status = $29,
			parts_collected_by_pm = $30,
			assembler_id = $31,
			completed_at = $32,
			completed_by_id = $33,
			updated_at = NOW()
		WHERE id = $1
	`,
		existing.ID,
		existing.ProjectNumber,
		existing.SubAssembly,
		existing.PartNumber,
		existing.Description,
		existing.Revision,
		existing.Material,
		existing.Qty,
		existing.PartType,
		existing.PDMVaultReleased,
		existing.ReasonForRework,
		existing.PMReleasedToID,
		existing.DateReleasedToMfg,
		existing.RequestedCompletionDate,
		existing.PMDeliveredTo,
		existing.ExpectedCompletionDate,
		existing.MaterialOrderedDate,
		existing.AssignedMachinistID,
		existing.DateMfgCompleted,
		existing.PartGivenToOrLeftAt,
		existing.EstimatedHours,
		existing.ActualHours,
		existing.RequiresOutsideProcessing,
		existing.OutsideVendor,
		existing.DateSentForProcessing,
		existing.DateExpectedFromProcessing,
		existing.DateReceivedFromProcessing,
		existing.KittingDeliveredTo,
		existing.Status,
		existing.PartsCollectedByPM,
		existing.AssemblerID,
		existing.CompletedAt,
		existing.CompletedByID,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update rework item", err)
		return
	}

	// If transitioning to complete, auto-mark linked defect as fixed
	if existing.Status == "complete" && existing.DefectID != nil {
		_, _ = db.DB.Exec(`
			UPDATE defects 
			SET status = 'fixed', resolved_at = NOW() 
			WHERE id = $1 AND status = 'open'
		`, *existing.DefectID)
	}

	updatedItem, err := fetchReworkItemByID(uuid.MustParse(id))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Error retrieving updated item", err)
		return
	}

	if existing.Status == "complete" {
		BroadcastEvent("rework_completed", updatedItem)
	} else {
		BroadcastEvent("rework_updated", updatedItem)
	}

	respondJSON(w, http.StatusOK, updatedItem)
}

// handleAfterHoursDrop flags a part left on the desk after hours and triggers alert
func handleAfterHoursDrop(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	var req struct {
		PartGivenToOrLeftAt string `json:"part_given_to_or_left_at"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	location := "Manufacturing Desk"
	if req.PartGivenToOrLeftAt != "" {
		location = req.PartGivenToOrLeftAt
	}

	_, err := db.DB.Exec(`
		UPDATE rework_items 
		SET is_after_hours_drop = TRUE,
		    part_given_to_or_left_at = $2,
		    updated_at = NOW()
		WHERE id = $1
	`, id, location)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark after hours drop", err)
		return
	}

	updatedItem, err := fetchReworkItemByID(uuid.MustParse(id))
	if err == nil {
		BroadcastEvent("notification_alert", map[string]interface{}{
			"id":          updatedItem.ID.String(),
			"type":        "rework_after_hours_drop",
			"title":       fmt.Sprintf("After Hours Drop: %s", updatedItem.PartNumber),
			"description": fmt.Sprintf("Drawing & parts left at %s for Project %s (Rev %s).", location, updatedItem.ProjectNumber, updatedItem.Revision),
			"department":  "machine_shop",
			"created_at":  time.Now().Format(time.RFC3339),
		})
		BroadcastEvent("rework_updated", updatedItem)
	}

	respondJSON(w, http.StatusOK, updatedItem)
}

// handleDeleteReworkItem removes a rework ticket
func handleDeleteReworkItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	_, err := db.DB.Exec("DELETE FROM rework_items WHERE id = $1", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete rework item", err)
		return
	}

	BroadcastEvent("rework_deleted", map[string]string{"id": id})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": id})
}

// handleGetProjectReworkSummary calculates high-level rework metrics for a sales order
func handleGetProjectReworkSummary(w http.ResponseWriter, r *http.Request) {
	salesOrderID := r.PathValue("id")
	if salesOrderID == "" {
		respondError(w, http.StatusBadRequest, "Sales Order ID is required", nil)
		return
	}

	query := `
		SELECT 
			COALESCE(COUNT(*) FILTER (WHERE status != 'complete' AND status != 'cancelled'), 0) as total_active,
			COALESCE(COUNT(*) FILTER (WHERE status IN ('released_to_mfg', 'in_machining')), 0) as total_in_mfg,
			COALESCE(COUNT(*) FILTER (WHERE status = 'outside_processing' OR requires_outside_processing = TRUE AND status != 'complete'), 0) as total_outside_pp,
			COALESCE(COUNT(*) FILTER (WHERE status = 'complete'), 0) as total_completed,
			COALESCE(SUM(estimated_hours), 0) as total_est_hours,
			COALESCE(SUM(actual_hours), 0) as total_act_hours
		FROM rework_items
		WHERE sales_order_id = $1
	`

	var s models.ProjectReworkSummary
	s.SalesOrderID = uuid.MustParse(salesOrderID)

	err := db.DB.QueryRow(query, salesOrderID).Scan(
		&s.TotalActive,
		&s.TotalInMfg,
		&s.TotalOutsidePP,
		&s.TotalCompleted,
		&s.TotalEstHours,
		&s.TotalActHours,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	respondJSON(w, http.StatusOK, s)
}

// handleGetMachineFATReadiness inspects open defects, active NCRs, and incomplete rework to block premature FAT
func handleGetMachineFATReadiness(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var resp models.MachineFATReadinessResponse
	resp.MachineID = uuid.MustParse(machineID)
	resp.Blockers = []string{}

	// 1. Open Issues
	_ = db.DB.QueryRow(`
		SELECT COUNT(*) FROM defects WHERE machine_id = $1 AND status != 'verified'
	`, machineID).Scan(&resp.OpenIssues)

	// 2. Open NCRs
	_ = db.DB.QueryRow(`
		SELECT COUNT(*) FROM defects WHERE machine_id = $1 AND is_ncr = TRUE AND (closeout_date IS NULL OR status != 'verified')
	`, machineID).Scan(&resp.OpenNCRs)

	// 3. Active Rework
	_ = db.DB.QueryRow(`
		SELECT COUNT(*) FROM rework_items WHERE machine_id = $1 AND status != 'complete' AND status != 'cancelled'
	`, machineID).Scan(&resp.ActiveRework)

	if resp.OpenIssues > 0 {
		resp.Blockers = append(resp.Blockers, fmt.Sprintf("%d unverified defect(s) pending resolution", resp.OpenIssues))
	}
	if resp.OpenNCRs > 0 {
		resp.Blockers = append(resp.Blockers, fmt.Sprintf("%d active Non-Conformance Report(s) awaiting closeout signature", resp.OpenNCRs))
	}
	if resp.ActiveRework > 0 {
		resp.Blockers = append(resp.Blockers, fmt.Sprintf("%d active rework item(s) currently in progress or post-processing", resp.ActiveRework))
	}

	resp.CanProceed = len(resp.Blockers) == 0

	respondJSON(w, http.StatusOK, resp)
}

// Controls Master Electrical Schematic Handlers (SOP Step 6)

func handleGetControlsSchematicReworks(w http.ResponseWriter, r *http.Request) {
	salesOrderID := r.URL.Query().Get("sales_order_id")
	machineID := r.URL.Query().Get("machine_id")

	query := `
		SELECT 
			c.id, c.sales_order_id, c.machine_id, c.schematic_number,
			c.master_copy_redlined, c.redlined_by_user_id, u1.username as redlined_by_user_name,
			c.redlines_description, c.schematics_digitally_updated,
			c.updated_by_user_id, u2.username as updated_by_user_name, c.updated_at,
			c.checklist_signed_off, c.signed_off_by_user_id, u3.username as signed_off_by_user_name,
			c.signed_off_at, c.created_at
		FROM controls_schematic_reworks c
		LEFT JOIN users u1 ON c.redlined_by_user_id = u1.id
		LEFT JOIN users u2 ON c.updated_by_user_id = u2.id
		LEFT JOIN users u3 ON c.signed_off_by_user_id = u3.id
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if salesOrderID != "" {
		query += fmt.Sprintf(" AND c.sales_order_id = $%d", argIdx)
		args = append(args, salesOrderID)
		argIdx++
	}
	if machineID != "" {
		query += fmt.Sprintf(" AND c.machine_id = $%d", argIdx)
		args = append(args, machineID)
		argIdx++
	}

	query += " ORDER BY c.created_at DESC"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}
	defer rows.Close()

	list := []models.ControlsSchematicRework{}
	for rows.Next() {
		var it models.ControlsSchematicRework
		if err := rows.Scan(
			&it.ID, &it.SalesOrderID, &it.MachineID, &it.SchematicNumber,
			&it.MasterCopyRedlined, &it.RedlinedByUserID, &it.RedlinedByUserName,
			&it.RedlinesDescription, &it.SchematicsDigitallyUpdated,
			&it.UpdatedByUserID, &it.UpdatedByUserName, &it.UpdatedAt,
			&it.ChecklistSignedOff, &it.SignedOffByUserID, &it.SignedOffByUserName,
			&it.SignedOffAt, &it.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning schematic record", err)
			return
		}
		list = append(list, it)
	}

	respondJSON(w, http.StatusOK, list)
}

func handleCreateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SalesOrderID        string  `json:"sales_order_id"`
		MachineID           string  `json:"machine_id"`
		SchematicNumber     string  `json:"schematic_number"`
		MasterCopyRedlined  bool    `json:"master_copy_redlined"`
		RedlinesDescription *string `json:"redlines_description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.MachineID == "" || req.SchematicNumber == "" {
		respondError(w, http.StatusBadRequest, "Machine ID and schematic number are required", nil)
		return
	}

	if req.SalesOrderID == "" {
		_ = db.DB.QueryRow("SELECT sales_order_id FROM machines WHERE id = $1", req.MachineID).Scan(&req.SalesOrderID)
	}

	authUserID := getAuthenticatedUserID(r)
	var redlinedUserID *string
	if req.MasterCopyRedlined && authUserID != "" {
		redlinedUserID = &authUserID
	}

	var newID uuid.UUID
	err := db.DB.QueryRow(`
		INSERT INTO controls_schematic_reworks (
			sales_order_id, machine_id, schematic_number, master_copy_redlined,
			redlined_by_user_id, redlines_description
		)
		VALUES ($1, $2, $3, $4, NULLIF($5, '')::uuid, $6)
		RETURNING id
	`, req.SalesOrderID, req.MachineID, req.SchematicNumber, req.MasterCopyRedlined, redlinedUserID, req.RedlinesDescription).Scan(&newID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to record controls schematic rework", err)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{"id": newID, "status": "created"})
}

func handleUpdateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "ID is required", nil)
		return
	}

	var req struct {
		MasterCopyRedlined         *bool   `json:"master_copy_redlined"`
		RedlinesDescription        *string `json:"redlines_description"`
		SchematicsDigitallyUpdated *bool   `json:"schematics_digitally_updated"`
		ChecklistSignedOff         *bool   `json:"checklist_signed_off"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	_, err := db.DB.Exec(`
		UPDATE controls_schematic_reworks SET
			master_copy_redlined = COALESCE($2, master_copy_redlined),
			redlines_description = COALESCE($3, redlines_description),
			schematics_digitally_updated = COALESCE($4, schematics_digitally_updated),
			updated_by_user_id = CASE WHEN $4 = TRUE AND updated_by_user_id IS NULL THEN NULLIF($6, '')::uuid ELSE updated_by_user_id END,
			updated_at = CASE WHEN $4 = TRUE AND updated_at IS NULL THEN NOW() ELSE updated_at END,
			checklist_signed_off = COALESCE($5, checklist_signed_off),
			signed_off_by_user_id = CASE WHEN $5 = TRUE AND signed_off_by_user_id IS NULL THEN NULLIF($6, '')::uuid ELSE signed_off_by_user_id END,
			signed_off_at = CASE WHEN $5 = TRUE AND signed_off_at IS NULL THEN NOW() ELSE signed_off_at END
		WHERE id = $1
	`, id, req.MasterCopyRedlined, req.RedlinesDescription, req.SchematicsDigitallyUpdated, req.ChecklistSignedOff, authUserID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update controls schematic rework", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated", "id": id})
}

// Helpers

func fetchReworkItemByID(id uuid.UUID) (models.ReworkItem, error) {
	query := `
		SELECT 
			r.id, r.sales_order_id, so.project_name, so.customer_name,
			r.machine_id, m.order_number,
			r.defect_id, COALESCE(d.is_ncr, false) as is_ncr, d.ncr_number,
			r.project_number, r.sub_assembly, r.part_number, r.description,
			r.revision, r.material, r.qty, r.part_type,
			r.mech_designer_id, des.username as mech_designer_name,
			r.date_released_from_mech_design,
			r.pm_released_to_id, pm.username as pm_released_to_name,
			r.pdm_vault_released,
			r.reason_for_rework, r.date_released_to_mfg, r.requested_completion_date,
			r.pm_delivered_to, r.pm_date_delivered,
			r.expected_completion_date, r.material_ordered_date,
			r.assigned_machinist_id, mach.username as assigned_machinist_name,
			r.date_mfg_completed, r.part_given_to_or_left_at, r.is_after_hours_drop,
			r.estimated_hours, r.actual_hours,
			r.requires_outside_processing, r.outside_vendor,
			r.date_sent_for_processing, r.date_expected_from_processing, r.date_received_from_processing,
			r.kitting_delivered_to, r.kitting_date_delivered,
			r.status,
			r.assembler_id, asm.username as assembler_name,
			r.parts_collected_by_pm, r.is_assembler_self_modified,
			r.completed_at, r.completed_by_id, comp.username as completed_by_name,
			r.created_at, r.updated_at
		FROM rework_items r
		JOIN sales_orders so ON r.sales_order_id = so.id
		LEFT JOIN machines m ON r.machine_id = m.id
		LEFT JOIN defects d ON r.defect_id = d.id
		LEFT JOIN users des ON r.mech_designer_id = des.id
		LEFT JOIN users pm ON r.pm_released_to_id = pm.id
		LEFT JOIN users mach ON r.assigned_machinist_id = mach.id
		LEFT JOIN users asm ON r.assembler_id = asm.id
		LEFT JOIN users comp ON r.completed_by_id = comp.id
		WHERE r.id = $1
	`

	var it models.ReworkItem
	var reqCompDate, expCompDate, matOrdDate sql.NullString
	var dtSentProc, dtExpProc, dtRecvProc sql.NullString

	err := db.DB.QueryRow(query, id).Scan(
		&it.ID, &it.SalesOrderID, &it.ProjectName, &it.CustomerName,
		&it.MachineID, &it.OrderNumber,
		&it.DefectID, &it.IsNCR, &it.NCRNumber,
		&it.ProjectNumber, &it.SubAssembly, &it.PartNumber, &it.Description,
		&it.Revision, &it.Material, &it.Qty, &it.PartType,
		&it.MechDesignerID, &it.MechDesignerName,
		&it.DateReleasedFromMechDesign,
		&it.PMReleasedToID, &it.PMReleasedToName,
		&it.PDMVaultReleased,
		&it.ReasonForRework, &it.DateReleasedToMfg, &reqCompDate,
		&it.PMDeliveredTo, &it.PMDateDelivered,
		&expCompDate, &matOrdDate,
		&it.AssignedMachinistID, &it.AssignedMachinistName,
		&it.DateMfgCompleted, &it.PartGivenToOrLeftAt, &it.IsAfterHoursDrop,
		&it.EstimatedHours, &it.ActualHours,
		&it.RequiresOutsideProcessing, &it.OutsideVendor,
		&dtSentProc, &dtExpProc, &dtRecvProc,
		&it.KittingDeliveredTo, &it.KittingDateDelivered,
		&it.Status,
		&it.AssemblerID, &it.AssemblerName,
		&it.PartsCollectedByPM, &it.IsAssemblerSelfModified,
		&it.CompletedAt, &it.CompletedByID, &it.CompletedByName,
		&it.CreatedAt, &it.UpdatedAt,
	)

	if err != nil {
		return it, err
	}

	if reqCompDate.Valid {
		it.RequestedCompletionDate = &reqCompDate.String
	}
	if expCompDate.Valid {
		it.ExpectedCompletionDate = &expCompDate.String
	}
	if matOrdDate.Valid {
		it.MaterialOrderedDate = &matOrdDate.String
	}
	if dtSentProc.Valid {
		it.DateSentForProcessing = &dtSentProc.String
	}
	if dtExpProc.Valid {
		it.DateExpectedFromProcessing = &dtExpProc.String
	}
	if dtRecvProc.Valid {
		it.DateReceivedFromProcessing = &dtRecvProc.String
	}

	return it, nil
}

func nilIfEmpty(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

func defaultStr(s *string, def string) string {
	if s == nil || *s == "" {
		return def
	}
	return *s
}
