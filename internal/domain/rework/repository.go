package rework

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

// Repository defines data access operations for SOP 1-003 rework tracking
type Repository interface {
	GetReworkItems(ctx context.Context, salesOrderID, machineID, status, view, partType string) ([]models.ReworkItem, error)
	GetReworkItemByID(ctx context.Context, id uuid.UUID) (models.ReworkItem, error)
	CreateReworkItem(ctx context.Context, item *models.ReworkItem) (models.ReworkItem, *models.Defect, error)
	UpdateReworkItem(ctx context.Context, item *models.ReworkItem, authUserID string) (models.ReworkItem, *models.Defect, error)
	AfterHoursDrop(ctx context.Context, id uuid.UUID, location string, isAssemblerSelfMod bool, note string) (models.ReworkItem, error)
	DeleteReworkItem(ctx context.Context, id uuid.UUID) error
	GetProjectReworkSummary(ctx context.Context, salesOrderID uuid.UUID) (models.ProjectReworkSummary, error)
	GetMachineFATReadiness(ctx context.Context, machineID uuid.UUID) (models.MachineFATReadinessResponse, error)
	GetControlsSchematics(ctx context.Context, salesOrderID, machineID string) ([]models.ControlsSchematicRework, error)
	CreateControlsSchematic(ctx context.Context, salesOrderID, machineID, schematicNumber string, masterCopyRedlined bool, redlinedUserID *string, redlinesDescription *string) (uuid.UUID, error)
	UpdateControlsSchematic(ctx context.Context, id string, masterCopyRedlined, schematicsDigitallyUpdated, checklistSignedOff *bool, redlinesDescription *string, authUserID string) error
	ResolveSalesOrderID(ctx context.Context, soID, machineID, defectID *string) (string, error)
	GetProjectNumberForSO(ctx context.Context, soID string) (string, error)
}

type sqlRepository struct {
	db *sql.DB
}

// NewRepository creates a new PostgreSQL-backed rework repository
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) ResolveSalesOrderID(ctx context.Context, soID, machineID, defectID *string) (string, error) {
	if soID != nil && *soID != "" {
		return *soID, nil
	}
	if machineID != nil && *machineID != "" {
		var resolved string
		err := r.db.QueryRowContext(ctx, "SELECT sales_order_id FROM machines WHERE id = $1", *machineID).Scan(&resolved)
		if err == nil && resolved != "" {
			return resolved, nil
		}
	}
	if defectID != nil && *defectID != "" {
		var resolved string
		err := r.db.QueryRowContext(ctx, `
			SELECT m.sales_order_id 
			FROM defects d 
			JOIN machines m ON d.machine_id = m.id 
			WHERE d.id = $1
		`, *defectID).Scan(&resolved)
		if err == nil && resolved != "" {
			return resolved, nil
		}
	}
	return "", nil
}

func (r *sqlRepository) GetProjectNumberForSO(ctx context.Context, soID string) (string, error) {
	var autoProj sql.NullString
	_ = r.db.QueryRowContext(ctx, `
		SELECT COALESCE(so.internal_project_number, so.po_number, 'PROJ') 
		FROM sales_orders so 
		WHERE so.id = $1
	`, soID).Scan(&autoProj)
	if autoProj.Valid && autoProj.String != "" {
		return autoProj.String, nil
	}
	return "PROJ", nil
}

func (r *sqlRepository) GetReworkItems(ctx context.Context, salesOrderID, machineID, status, view, partType string) ([]models.ReworkItem, error) {
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
	} else if view == "active" {
		query += " AND r.status != 'complete' AND r.status != 'cancelled'"
	} else if view == "complete" {
		query += " AND r.status = 'complete'"
	}

	query += " ORDER BY r.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
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
			return nil, err
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

	return items, nil
}

func (r *sqlRepository) GetReworkItemByID(ctx context.Context, id uuid.UUID) (models.ReworkItem, error) {
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

	err := r.db.QueryRowContext(ctx, query, id).Scan(
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

func (r *sqlRepository) CreateReworkItem(ctx context.Context, item *models.ReworkItem) (models.ReworkItem, *models.Defect, error) {
	var relDateStr = ""
	if item.DateReleasedFromMechDesign != nil {
		relDateStr = item.DateReleasedFromMechDesign.Format(time.RFC3339)
	}

	var newID uuid.UUID
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO rework_items (
			sales_order_id, machine_id, defect_id, project_number, sub_assembly,
			part_number, description, revision, material, qty, part_type,
			mech_designer_id, date_released_from_mech_design, pm_released_to_id, pdm_vault_released,
			reason_for_rework, estimated_hours, assembler_id, is_assembler_self_modified, status
		)
		VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10, $11,
			$12, CASE WHEN $13 = '' THEN NOW() ELSE $13::timestamptz END, $14, $15,
			$16, $17, $18, $19, $20
		)
		RETURNING id
	`,
		item.SalesOrderID,
		item.MachineID,
		item.DefectID,
		item.ProjectNumber,
		item.SubAssembly,
		item.PartNumber,
		item.Description,
		item.Revision,
		item.Material,
		item.Qty,
		item.PartType,
		item.MechDesignerID,
		relDateStr,
		item.PMReleasedToID,
		item.PDMVaultReleased,
		item.ReasonForRework,
		item.EstimatedHours,
		item.AssemblerID,
		item.IsAssemblerSelfModified,
		item.Status,
	).Scan(&newID)

	if err != nil {
		return models.ReworkItem{}, nil, err
	}

	createdItem, err := r.GetReworkItemByID(ctx, newID)
	if err != nil {
		return models.ReworkItem{}, nil, err
	}

	var updatedDefect *models.Defect
	if item.DefectID != nil && *item.DefectID != uuid.Nil {
		noteAppend := fmt.Sprintf("\n[Escalated to Rework Order: %s]", item.PartNumber)
		var def models.Defect
		_ = r.db.QueryRowContext(ctx, `
			WITH updated AS (
				UPDATE defects 
				SET notes = COALESCE(notes, '') || $2
				WHERE id = $1
				RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
				          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature, label
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
		`, *item.DefectID, noteAppend).Scan(
			&def.ID, &def.MachineID, &def.SourceDepartment, &def.AssignedDepartment, &def.AssignedUserID, &def.CreatedByUserID, &def.FixedByUserID, &def.VerifiedByUserID, &def.Description, &def.Severity, &def.Status, &def.Notes, &def.ResolvedBy, &def.ResolvedAt, &def.CreatedAt, &def.DueDate,
			&def.IsNCR, &def.NCRNumber, &def.Assembler, &def.Location, &def.RootCause, &def.CorrectiveAction, &def.CloseoutDate, &def.TeamLeadSignature, &def.Label,
			&def.OrderNumber,
			&def.AssignedUserName, &def.CreatedByUserName, &def.FixedByUserName, &def.VerifiedByUserName,
		)
		if def.ID != uuid.Nil {
			updatedDefect = &def
		}
	}

	return createdItem, updatedDefect, nil
}

func (r *sqlRepository) UpdateReworkItem(ctx context.Context, item *models.ReworkItem, authUserID string) (models.ReworkItem, *models.Defect, error) {
	query := `
		UPDATE rework_items
		SET 
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
			requested_completion_date = $14,
			pm_delivered_to = $15,
			pm_date_delivered = $16,
			expected_completion_date = $17,
			material_ordered_date = $18,
			assigned_machinist_id = $19,
			date_mfg_completed = $20,
			part_given_to_or_left_at = $21,
			estimated_hours = $22,
			actual_hours = $23,
			requires_outside_processing = $24,
			outside_vendor = $25,
			date_sent_for_processing = $26,
			date_expected_from_processing = $27,
			date_received_from_processing = $28,
			kitting_delivered_to = $29,
			status = $30,
			parts_collected_by_pm = $31,
			assembler_id = $32,
			completed_at = $33,
			completed_by_id = $34,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.db.ExecContext(ctx, query,
		item.ID,
		item.ProjectNumber,
		item.SubAssembly,
		item.PartNumber,
		item.Description,
		item.Revision,
		item.Material,
		item.Qty,
		item.PartType,
		item.PDMVaultReleased,
		item.ReasonForRework,
		item.PMReleasedToID,
		item.DateReleasedToMfg,
		item.RequestedCompletionDate,
		item.PMDeliveredTo,
		item.PMDateDelivered,
		item.ExpectedCompletionDate,
		item.MaterialOrderedDate,
		item.AssignedMachinistID,
		item.DateMfgCompleted,
		item.PartGivenToOrLeftAt,
		item.EstimatedHours,
		item.ActualHours,
		item.RequiresOutsideProcessing,
		item.OutsideVendor,
		item.DateSentForProcessing,
		item.DateExpectedFromProcessing,
		item.DateReceivedFromProcessing,
		item.KittingDeliveredTo,
		item.Status,
		item.PartsCollectedByPM,
		item.AssemblerID,
		item.CompletedAt,
		item.CompletedByID,
	)
	if err != nil {
		return models.ReworkItem{}, nil, err
	}

	var updatedDefect *models.Defect
	if item.Status == "complete" && item.DefectID != nil && *item.DefectID != uuid.Nil {
		var resolvedByStr = "System (Rework Completed)"
		var resolvedByUUID *uuid.UUID
		if authUserID != "" {
			if u, err := uuid.Parse(authUserID); err == nil {
				resolvedByUUID = &u
				var uname string
				if err := r.db.QueryRowContext(ctx, `SELECT username FROM users WHERE id = $1`, u).Scan(&uname); err == nil && uname != "" {
					resolvedByStr = uname
				}
			}
		}

		autoNote := fmt.Sprintf("\n[Auto-Resolved via Rework Part %s]", item.PartNumber)
		var def models.Defect
		_ = r.db.QueryRowContext(ctx, `
			WITH updated AS (
				UPDATE defects 
				SET status = 'fixed',
				    resolved_at = NOW(),
				    resolved_by = $2,
				    fixed_by_user_id = $3,
				    notes = COALESCE(notes, '') || $4
				WHERE id = $1 AND status = 'open'
				RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
				          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature, label
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
		`, *item.DefectID, resolvedByStr, resolvedByUUID, autoNote).Scan(
			&def.ID, &def.MachineID, &def.SourceDepartment, &def.AssignedDepartment, &def.AssignedUserID, &def.CreatedByUserID, &def.FixedByUserID, &def.VerifiedByUserID, &def.Description, &def.Severity, &def.Status, &def.Notes, &def.ResolvedBy, &def.ResolvedAt, &def.CreatedAt, &def.DueDate,
			&def.IsNCR, &def.NCRNumber, &def.Assembler, &def.Location, &def.RootCause, &def.CorrectiveAction, &def.CloseoutDate, &def.TeamLeadSignature, &def.Label,
			&def.OrderNumber,
			&def.AssignedUserName, &def.CreatedByUserName, &def.FixedByUserName, &def.VerifiedByUserName,
		)
		if def.ID != uuid.Nil {
			updatedDefect = &def
		}
	}

	updatedItem, err := r.GetReworkItemByID(ctx, item.ID)
	return updatedItem, updatedDefect, err
}

func (r *sqlRepository) AfterHoursDrop(ctx context.Context, id uuid.UUID, location string, isAssemblerSelfMod bool, note string) (models.ReworkItem, error) {
	status := "mfg_complete"
	if isAssemblerSelfMod {
		status = "complete"
	}

	_, err := r.db.ExecContext(ctx, `
		UPDATE rework_items
		SET 
			is_after_hours_drop = TRUE,
			part_given_to_or_left_at = $2,
			is_assembler_self_modified = $3,
			status = $4,
			date_mfg_completed = NOW(),
			reason_for_rework = CASE 
				WHEN $5 != '' THEN COALESCE(reason_for_rework, '') || E'\n[After-Hours Drop Note]: ' || $5
				ELSE reason_for_rework 
			END,
			updated_at = NOW()
		WHERE id = $1
	`, id, location, isAssemblerSelfMod, status, note)
	if err != nil {
		return models.ReworkItem{}, err
	}

	return r.GetReworkItemByID(ctx, id)
}

func (r *sqlRepository) DeleteReworkItem(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM rework_items WHERE id = $1", id)
	return err
}

func (r *sqlRepository) GetProjectReworkSummary(ctx context.Context, salesOrderID uuid.UUID) (models.ProjectReworkSummary, error) {
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
	s.SalesOrderID = salesOrderID

	err := r.db.QueryRowContext(ctx, query, salesOrderID).Scan(
		&s.TotalActive,
		&s.TotalInMfg,
		&s.TotalOutsidePP,
		&s.TotalCompleted,
		&s.TotalEstHours,
		&s.TotalActHours,
	)
	return s, err
}

func (r *sqlRepository) GetMachineFATReadiness(ctx context.Context, machineID uuid.UUID) (models.MachineFATReadinessResponse, error) {
	var resp models.MachineFATReadinessResponse
	resp.MachineID = machineID
	resp.Blockers = []string{}

	_ = r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM defects WHERE machine_id = $1 AND status != 'verified'
	`, machineID).Scan(&resp.OpenIssues)

	_ = r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM defects WHERE machine_id = $1 AND is_ncr = TRUE AND (closeout_date IS NULL OR status != 'verified')
	`, machineID).Scan(&resp.OpenNCRs)

	_ = r.db.QueryRowContext(ctx, `
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
	return resp, nil
}

func (r *sqlRepository) GetControlsSchematics(ctx context.Context, salesOrderID, machineID string) ([]models.ControlsSchematicRework, error) {
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
	}

	query += " ORDER BY c.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		list = append(list, it)
	}

	return list, nil
}

func (r *sqlRepository) CreateControlsSchematic(ctx context.Context, salesOrderID, machineID, schematicNumber string, masterCopyRedlined bool, redlinedUserID *string, redlinesDescription *string) (uuid.UUID, error) {
	if salesOrderID == "" {
		_ = r.db.QueryRowContext(ctx, "SELECT sales_order_id FROM machines WHERE id = $1", machineID).Scan(&salesOrderID)
	}

	var newID uuid.UUID
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO controls_schematic_reworks (
			sales_order_id, machine_id, schematic_number, master_copy_redlined,
			redlined_by_user_id, redlines_description
		)
		VALUES ($1, $2, $3, $4, NULLIF($5, '')::uuid, $6)
		RETURNING id
	`, salesOrderID, machineID, schematicNumber, masterCopyRedlined, redlinedUserID, redlinesDescription).Scan(&newID)

	return newID, err
}

func (r *sqlRepository) UpdateControlsSchematic(ctx context.Context, id string, masterCopyRedlined, schematicsDigitallyUpdated, checklistSignedOff *bool, redlinesDescription *string, authUserID string) error {
	_, err := r.db.ExecContext(ctx, `
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
	`, id, masterCopyRedlined, redlinesDescription, schematicsDigitallyUpdated, checklistSignedOff, authUserID)

	return err
}
