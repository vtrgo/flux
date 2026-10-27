package ncrs

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

// CreateNCRParams contains parameters required to persist a new NCR
type CreateNCRParams struct {
	MachineID           string
	NCRNumber           *string
	Assembler           string
	Location            string
	Description         string
	Severity            string
	SourceDepartment    string
	AssignedDepartment  string
	AssignedUserID      interface{}
	AuthUserID          string
	Notes               string
	DueDate             *time.Time
	CloseoutDate        *time.Time
	RootCause           *string
	CorrectiveAction    *string
	TeamLeadSignature   *string
	UpgradeFromDefectID *string
	AttachmentsDir      string
}

// UpdateNCRParams contains parameters required to update an existing NCR
type UpdateNCRParams struct {
	NCRID              string
	Assembler          *string
	Location           *string
	Description        *string
	Severity           *string
	Notes              *string
	AssignedDepartment *string
	AssignedUserID     interface{}
	DueDate            *time.Time
	RootCause          *string
	CorrectiveAction   *string
	CloseoutDate       *time.Time
	TeamLeadSignature  *string
	Status             *string
	AuthUserID         string
}

// CreateNCRResult contains the created NCR and optional updated old defect if upgraded
type CreateNCRResult struct {
	NCR              models.NCRDetail
	UpdatedOldDefect *models.Defect
	AssignedUserEmail *string
	OpenedByName     string
}

// UpdateNCRResult contains the updated NCR and notification metadata
type UpdateNCRResult struct {
	NCR               models.NCRDetail
	AssignedUserEmail *string
	OpenedByName      string
}

// Repository defines data access operations for Non-Conformance Reports
type Repository interface {
	GenerateNextNCRNumber(ctx context.Context) (string, error)
	GetNCRs(ctx context.Context, search, status, machineID string) ([]models.NCRDetail, error)
	FindUserBySignature(ctx context.Context, signature string) (string, error)
	FindDefectAssignedUserID(ctx context.Context, defectID string) (string, error)
	CreateNCR(ctx context.Context, params CreateNCRParams) (*CreateNCRResult, error)
	UpdateNCR(ctx context.Context, params UpdateNCRParams) (*UpdateNCRResult, error)
}

type sqlRepository struct {
	db *sql.DB
}

// NewRepository creates a new PostgreSQL-backed NCR repository
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) GenerateNextNCRNumber(ctx context.Context) (string, error) {
	year := time.Now().Format("2006")
	prefix := fmt.Sprintf("NCR-%s-", year)

	var lastNumber sql.NullString
	err := r.db.QueryRowContext(ctx, `
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

func (r *sqlRepository) GetNCRs(ctx context.Context, search, status, machineID string) ([]models.NCRDetail, error) {
	query := `
		SELECT d.id, d.machine_id, d.source_department, d.assigned_department, d.assigned_user_id,
		       d.created_by_user_id, d.fixed_by_user_id, d.verified_by_user_id,
		       d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at, d.due_date,
		       d.is_ncr, d.ncr_number, d.assembler, d.location, d.root_cause, d.corrective_action, d.closeout_date, d.team_lead_signature, d.label,
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

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ncrs []models.NCRDetail
	for rows.Next() {
		var ncr models.NCRDetail
		var assigned sql.NullString
		if err := rows.Scan(
			&ncr.ID, &ncr.MachineID, &ncr.SourceDepartment, &assigned, &ncr.AssignedUserID,
			&ncr.CreatedByUserID, &ncr.FixedByUserID, &ncr.VerifiedByUserID,
			&ncr.Description, &ncr.Severity, &ncr.Status, &ncr.Notes, &ncr.ResolvedBy, &ncr.ResolvedAt, &ncr.CreatedAt, &ncr.DueDate,
			&ncr.IsNCR, &ncr.NCRNumber, &ncr.Assembler, &ncr.Location, &ncr.RootCause, &ncr.CorrectiveAction, &ncr.CloseoutDate, &ncr.TeamLeadSignature, &ncr.Label,
			&ncr.AssignedUserName, &ncr.CreatedByUserName, &ncr.FixedByUserName, &ncr.VerifiedByUserName,
			&ncr.OrderNumber, &ncr.InternalProjectNumber, &ncr.ProjectName, &ncr.CustomerName,
		); err != nil {
			return nil, err
		}
		if assigned.Valid {
			ncr.AssignedDepartment = assigned.String
		}
		ncrs = append(ncrs, ncr)
	}
	return ncrs, nil
}

func (r *sqlRepository) FindUserBySignature(ctx context.Context, signature string) (string, error) {
	var matchedID string
	err := r.db.QueryRowContext(ctx, `
		SELECT id FROM users
		WHERE TRIM(CONCAT(first_name, ' ', last_name)) = $1
		   OR username = $1
		   OR email = $1
		LIMIT 1
	`, signature).Scan(&matchedID)
	return matchedID, err
}

func (r *sqlRepository) FindDefectAssignedUserID(ctx context.Context, defectID string) (string, error) {
	var origAssignedID sql.NullString
	err := r.db.QueryRowContext(ctx, `SELECT assigned_user_id FROM defects WHERE id = $1`, defectID).Scan(&origAssignedID)
	if err != nil {
		return "", err
	}
	if origAssignedID.Valid {
		return origAssignedID.String, nil
	}
	return "", nil
}

func (r *sqlRepository) CreateNCR(ctx context.Context, params CreateNCRParams) (*CreateNCRResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to start database transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var res CreateNCRResult
	var machineOrderNumber string

	err = tx.QueryRowContext(ctx, `
		WITH inserted AS (
			INSERT INTO defects (
				machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id,
				description, severity, status, notes, due_date,
				is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature
			)
			VALUES ($1, $2, $3, $4, NULLIF($8, '')::uuid, $5, $6, 'open', $7, $9, TRUE, $10, $11, $12, $13, $14, $15, $16)
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id,
			          description, severity, status, notes, resolved_by, resolved_at, created_at, due_date,
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature, label
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
	`, params.MachineID, params.SourceDepartment, params.AssignedDepartment, params.AssignedUserID,
		params.Description, params.Severity, params.Notes, params.AuthUserID, params.DueDate,
		params.NCRNumber, params.Assembler, params.Location, params.RootCause, params.CorrectiveAction,
		params.CloseoutDate, params.TeamLeadSignature,
	).Scan(
		&res.NCR.ID, &res.NCR.MachineID, &res.NCR.SourceDepartment, &res.NCR.AssignedDepartment, &res.NCR.AssignedUserID,
		&res.NCR.CreatedByUserID, &res.NCR.FixedByUserID, &res.NCR.VerifiedByUserID,
		&res.NCR.Description, &res.NCR.Severity, &res.NCR.Status, &res.NCR.Notes, &res.NCR.ResolvedBy, &res.NCR.ResolvedAt, &res.NCR.CreatedAt, &res.NCR.DueDate,
		&res.NCR.IsNCR, &res.NCR.NCRNumber, &res.NCR.Assembler, &res.NCR.Location, &res.NCR.RootCause, &res.NCR.CorrectiveAction, &res.NCR.CloseoutDate, &res.NCR.TeamLeadSignature, &res.NCR.Label,
		&res.NCR.AssignedUserName, &res.NCR.CreatedByUserName, &res.NCR.FixedByUserName, &res.NCR.VerifiedByUserName,
		&res.AssignedUserEmail, &machineOrderNumber, &res.OpenedByName,
		&res.NCR.InternalProjectNumber, &res.NCR.ProjectName, &res.NCR.CustomerName,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create NCR: %w", err)
	}
	res.NCR.OrderNumber = machineOrderNumber

	// Handle upgrading from an existing defect
	if params.UpgradeFromDefectID != nil && strings.TrimSpace(*params.UpgradeFromDefectID) != "" {
		oldDefectID := strings.TrimSpace(*params.UpgradeFromDefectID)

		// Copy attachments if attachments directory exists
		if params.AttachmentsDir != "" {
			attRows, err := tx.QueryContext(ctx, `SELECT id, filename, mime_type, byte_size, metadata FROM attachments WHERE issue_id = $1`, oldDefectID)
			if err == nil {
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

				dstDir := filepath.Join(params.AttachmentsDir, res.NCR.ID.String())
				for _, item := range attsToCopy {
					newID := uuid.New().String()
					ext := filepath.Ext(item.filename)
					srcFile := filepath.Join(params.AttachmentsDir, oldDefectID, item.oldID+ext)
					dstFile := filepath.Join(dstDir, newID+ext)

					if srcBytes, err := os.ReadFile(srcFile); err == nil {
						_ = os.MkdirAll(dstDir, 0755)
						_ = os.WriteFile(dstFile, srcBytes, 0644)
					}

					_, _ = tx.ExecContext(ctx, `
						INSERT INTO attachments (id, issue_id, filename, mime_type, byte_size, metadata)
						VALUES ($1, $2, $3, $4, $5, $6)
					`, newID, res.NCR.ID, item.filename, item.mimeType, item.byteSize, item.metadata)
				}
			}
		}

		// Re-link machine shop tasks and laser tasks
		_, _ = tx.ExecContext(ctx, `UPDATE machine_shop_tasks SET defect_id = $1 WHERE defect_id = $2`, res.NCR.ID, oldDefectID)
		_, _ = tx.ExecContext(ctx, `UPDATE laser_tasks SET defect_id = $1 WHERE defect_id = $2`, res.NCR.ID, oldDefectID)

		// Mark original defect as signed off and verified
		ncrNumDisplay := "NCR"
		if res.NCR.NCRNumber != nil && *res.NCR.NCRNumber != "" {
			ncrNumDisplay = *res.NCR.NCRNumber
		}
		auditNote := fmt.Sprintf("[Verified/Cleared: Upgraded to %s]", ncrNumDisplay)

		var updatedOldDefect models.Defect
		err = tx.QueryRowContext(ctx, `
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
		`, oldDefectID, params.AuthUserID, auditNote).Scan(
			&updatedOldDefect.ID, &updatedOldDefect.MachineID, &updatedOldDefect.SourceDepartment, &updatedOldDefect.AssignedDepartment, &updatedOldDefect.AssignedUserID, &updatedOldDefect.CreatedByUserID, &updatedOldDefect.FixedByUserID, &updatedOldDefect.VerifiedByUserID, &updatedOldDefect.Description, &updatedOldDefect.Severity, &updatedOldDefect.Status, &updatedOldDefect.Notes, &updatedOldDefect.ResolvedBy, &updatedOldDefect.ResolvedAt, &updatedOldDefect.CreatedAt, &updatedOldDefect.DueDate,
			&updatedOldDefect.IsNCR, &updatedOldDefect.NCRNumber, &updatedOldDefect.Assembler, &updatedOldDefect.Location, &updatedOldDefect.RootCause, &updatedOldDefect.CorrectiveAction, &updatedOldDefect.CloseoutDate, &updatedOldDefect.TeamLeadSignature, &updatedOldDefect.Label,
			&updatedOldDefect.OrderNumber,
			&updatedOldDefect.AssignedUserName, &updatedOldDefect.CreatedByUserName, &updatedOldDefect.FixedByUserName, &updatedOldDefect.VerifiedByUserName,
		)
		if err == nil {
			res.UpdatedOldDefect = &updatedOldDefect
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &res, nil
}

func (r *sqlRepository) UpdateNCR(ctx context.Context, params UpdateNCRParams) (*UpdateNCRResult, error) {
	var statusVal string
	if params.Status != nil {
		statusVal = *params.Status
	}

	var res UpdateNCRResult
	err := r.db.QueryRowContext(ctx, `
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
			          is_ncr, ncr_number, assembler, location, root_cause, corrective_action, closeout_date, team_lead_signature, label
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
	`, params.NCRID, params.Assembler, params.Location, params.Description, params.Severity, params.Notes,
		params.AssignedDepartment, params.AssignedUserID, params.DueDate, params.RootCause, params.CorrectiveAction,
		params.CloseoutDate, params.TeamLeadSignature, statusVal, params.AuthUserID,
	).Scan(
		&res.NCR.ID, &res.NCR.MachineID, &res.NCR.SourceDepartment, &res.NCR.AssignedDepartment, &res.NCR.AssignedUserID,
		&res.NCR.CreatedByUserID, &res.NCR.FixedByUserID, &res.NCR.VerifiedByUserID,
		&res.NCR.Description, &res.NCR.Severity, &res.NCR.Status, &res.NCR.Notes, &res.NCR.ResolvedBy, &res.NCR.ResolvedAt, &res.NCR.CreatedAt, &res.NCR.DueDate,
		&res.NCR.IsNCR, &res.NCR.NCRNumber, &res.NCR.Assembler, &res.NCR.Location, &res.NCR.RootCause, &res.NCR.CorrectiveAction, &res.NCR.CloseoutDate, &res.NCR.TeamLeadSignature, &res.NCR.Label,
		&res.NCR.AssignedUserName, &res.NCR.CreatedByUserName, &res.NCR.FixedByUserName, &res.NCR.VerifiedByUserName,
		&res.AssignedUserEmail, &res.OpenedByName,
		&res.NCR.OrderNumber, &res.NCR.InternalProjectNumber, &res.NCR.ProjectName, &res.NCR.CustomerName,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update NCR: %w", err)
	}

	return &res, nil
}
