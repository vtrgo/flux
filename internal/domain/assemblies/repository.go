package assemblies

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

type Repository interface {
	GetAssemblyTree(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error)
	GetAssemblyList(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error)
	GetAssemblyByID(ctx context.Context, id uuid.UUID) (*models.MachineAssembly, error)
	CreateAssembly(ctx context.Context, a *models.MachineAssembly) error
	UpdateAssembly(ctx context.Context, a *models.MachineAssembly) error
	DeleteAssembly(ctx context.Context, id uuid.UUID) error
	BatchInsert(ctx context.Context, machineID uuid.UUID, nodes []models.ParsedBOMNode) error
	GetKittingPartsForAssembly(ctx context.Context, assemblyID uuid.UUID) ([]models.KittingPart, error)
	AddPartToAssembly(ctx context.Context, p *models.KittingPart) error
	UpdateKittingPartPick(ctx context.Context, partID uuid.UUID, qtyPicked int, fulfilledBy string) (*models.KittingPart, error)
}

type sqlRepository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) GetAssemblyTree(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	// 1. Fetch all assemblies for the machine with actual hours joined
	query := `
		SELECT 
			a.id, a.machine_id, a.parent_assembly_id, a.assembly_code, a.name, 
			COALESCE(a.description, ''), COALESCE(a.drawing_number, ''), a.revision, 
			a.department, a.quoted_hours, a.status, a.sequence_order, a.created_at, a.updated_at,
			COALESCE(act.actual_hours, 0.0) as actual_hours
		FROM machine_assemblies a
		LEFT JOIN (
			SELECT assembly_id, COALESCE(SUM(hours_spent), 0.0) as actual_hours
			FROM time_entries
			WHERE machine_id = $1 AND assembly_id IS NOT NULL
			GROUP BY assembly_id
		) act ON a.id = act.assembly_id
		WHERE a.machine_id = $1
		ORDER BY a.sequence_order, a.assembly_code ASC
	`

	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query assemblies: %w", err)
	}
	defer rows.Close()

	var allAssemblies []models.MachineAssembly
	asmMap := make(map[uuid.UUID]*models.MachineAssembly)

	for rows.Next() {
		var a models.MachineAssembly
		if err := rows.Scan(
			&a.ID, &a.MachineID, &a.ParentAssemblyID, &a.AssemblyCode, &a.Name,
			&a.Description, &a.DrawingNumber, &a.Revision, &a.Department,
			&a.QuotedHours, &a.Status, &a.SequenceOrder, &a.CreatedAt, &a.UpdatedAt,
			&a.ActualHours,
		); err != nil {
			return nil, fmt.Errorf("failed to scan assembly row: %w", err)
		}
		a.Variance = a.ActualHours - a.QuotedHours
		a.SubAssemblies = []models.MachineAssembly{}
		a.Parts = []models.KittingPart{}
		allAssemblies = append(allAssemblies, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading assembly rows: %w", err)
	}

	for i := range allAssemblies {
		asmMap[allAssemblies[i].ID] = &allAssemblies[i]
	}

	// 2. Fetch all kitting parts for this machine
	partsQuery := `
		SELECT id, machine_id, assembly_id, department, part_number, COALESCE(description, ''), 
		       qty_required, qty_picked, status, fulfilled_at, fulfilled_by
		FROM kitting_parts
		WHERE machine_id = $1 AND assembly_id IS NOT NULL
		ORDER BY part_number ASC
	`
	partRows, err := r.db.QueryContext(ctx, partsQuery, machineID)
	if err == nil {
		defer partRows.Close()
		for partRows.Next() {
			var p models.KittingPart
			if err := partRows.Scan(
				&p.ID, &p.MachineID, &p.AssemblyID, &p.Department, &p.PartNumber,
				&p.Description, &p.QtyRequired, &p.QtyPicked, &p.Status,
				&p.FulfilledAt, &p.FulfilledBy,
			); err == nil {
				if p.AssemblyID != nil {
					if targetAsm, ok := asmMap[*p.AssemblyID]; ok {
						targetAsm.Parts = append(targetAsm.Parts, p)
					}
				}
			}
		}
	}

	// 3. Assemble hierarchy tree
	// First pass: attach children to parents
	for i := range allAssemblies {
		a := &allAssemblies[i]
		if a.ParentAssemblyID != nil {
			if parent, ok := asmMap[*a.ParentAssemblyID]; ok {
				parent.SubAssemblies = append(parent.SubAssemblies, *a)
			}
		}
	}

	// Second pass: collect root nodes (which now contain all nested children)
	var rootAssemblies []models.MachineAssembly
	for i := range allAssemblies {
		a := &allAssemblies[i]
		if a.ParentAssemblyID == nil {
			rootAssemblies = append(rootAssemblies, *a)
		}
	}

	return rootAssemblies, nil
}

func (r *sqlRepository) GetAssemblyList(ctx context.Context, machineID uuid.UUID) ([]models.MachineAssembly, error) {
	query := `
		SELECT 
			a.id, a.machine_id, a.parent_assembly_id, a.assembly_code, a.name, 
			COALESCE(a.description, ''), COALESCE(a.drawing_number, ''), a.revision, 
			a.department, a.quoted_hours, a.status, a.sequence_order, a.created_at, a.updated_at,
			COALESCE(act.actual_hours, 0.0) as actual_hours
		FROM machine_assemblies a
		LEFT JOIN (
			SELECT assembly_id, COALESCE(SUM(hours_spent), 0.0) as actual_hours
			FROM time_entries
			WHERE machine_id = $1 AND assembly_id IS NOT NULL
			GROUP BY assembly_id
		) act ON a.id = act.assembly_id
		WHERE a.machine_id = $1
		ORDER BY a.sequence_order, a.assembly_code ASC
	`
	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query assemblies: %w", err)
	}
	defer rows.Close()

	var assemblies []models.MachineAssembly
	for rows.Next() {
		var a models.MachineAssembly
		if err := rows.Scan(
			&a.ID, &a.MachineID, &a.ParentAssemblyID, &a.AssemblyCode, &a.Name,
			&a.Description, &a.DrawingNumber, &a.Revision, &a.Department,
			&a.QuotedHours, &a.Status, &a.SequenceOrder, &a.CreatedAt, &a.UpdatedAt,
			&a.ActualHours,
		); err != nil {
			return nil, fmt.Errorf("failed to scan assembly row: %w", err)
		}
		a.Variance = a.ActualHours - a.QuotedHours
		assemblies = append(assemblies, a)
	}
	return assemblies, nil
}

func (r *sqlRepository) GetAssemblyByID(ctx context.Context, id uuid.UUID) (*models.MachineAssembly, error) {
	query := `
		SELECT 
			a.id, a.machine_id, a.parent_assembly_id, a.assembly_code, a.name, 
			COALESCE(a.description, ''), COALESCE(a.drawing_number, ''), a.revision, 
			a.department, a.quoted_hours, a.status, a.sequence_order, a.created_at, a.updated_at,
			COALESCE(act.actual_hours, 0.0) as actual_hours
		FROM machine_assemblies a
		LEFT JOIN (
			SELECT assembly_id, COALESCE(SUM(hours_spent), 0.0) as actual_hours
			FROM time_entries
			WHERE assembly_id = $1
			GROUP BY assembly_id
		) act ON a.id = act.assembly_id
		WHERE a.id = $1
	`
	var a models.MachineAssembly
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&a.ID, &a.MachineID, &a.ParentAssemblyID, &a.AssemblyCode, &a.Name,
		&a.Description, &a.DrawingNumber, &a.Revision, &a.Department,
		&a.QuotedHours, &a.Status, &a.SequenceOrder, &a.CreatedAt, &a.UpdatedAt,
		&a.ActualHours,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get assembly: %w", err)
	}
	a.Variance = a.ActualHours - a.QuotedHours

	// Also attach parts
	parts, _ := r.GetKittingPartsForAssembly(ctx, a.ID)
	a.Parts = parts

	return &a, nil
}

func (r *sqlRepository) CreateAssembly(ctx context.Context, a *models.MachineAssembly) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	if a.Status == "" {
		a.Status = models.AssemblyStatusDesignDraft
	}
	if a.Department == "" {
		a.Department = "assembly"
	}
	if a.Revision == "" {
		a.Revision = "A"
	}

	query := `
		INSERT INTO machine_assemblies (
			id, machine_id, parent_assembly_id, assembly_code, name, 
			description, drawing_number, revision, department, quoted_hours, 
			status, sequence_order, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
		) RETURNING created_at, updated_at
	`
	return r.db.QueryRowContext(
		ctx, query,
		a.ID, a.MachineID, a.ParentAssemblyID, a.AssemblyCode, a.Name,
		a.Description, a.DrawingNumber, a.Revision, a.Department, a.QuotedHours,
		a.Status, a.SequenceOrder,
	).Scan(&a.CreatedAt, &a.UpdatedAt)
}

func (r *sqlRepository) UpdateAssembly(ctx context.Context, a *models.MachineAssembly) error {
	query := `
		UPDATE machine_assemblies
		SET parent_assembly_id = $2,
		    assembly_code = $3,
		    name = $4,
		    description = $5,
		    drawing_number = $6,
		    revision = $7,
		    department = $8,
		    quoted_hours = $9,
		    status = $10,
		    sequence_order = $11,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at
	`
	err := r.db.QueryRowContext(
		ctx, query,
		a.ID, a.ParentAssemblyID, a.AssemblyCode, a.Name, a.Description,
		a.DrawingNumber, a.Revision, a.Department, a.QuotedHours, a.Status,
		a.SequenceOrder,
	).Scan(&a.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update assembly: %w", err)
	}
	return nil
}

func (r *sqlRepository) DeleteAssembly(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM machine_assemblies WHERE id = $1`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete assembly: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *sqlRepository) GetKittingPartsForAssembly(ctx context.Context, assemblyID uuid.UUID) ([]models.KittingPart, error) {
	query := `
		SELECT id, machine_id, assembly_id, department, part_number, COALESCE(description, ''), 
		       qty_required, qty_picked, status, fulfilled_at, fulfilled_by
		FROM kitting_parts
		WHERE assembly_id = $1
		ORDER BY part_number ASC
	`
	rows, err := r.db.QueryContext(ctx, query, assemblyID)
	if err != nil {
		return nil, fmt.Errorf("failed to query kitting parts: %w", err)
	}
	defer rows.Close()

	var parts []models.KittingPart
	for rows.Next() {
		var p models.KittingPart
		if err := rows.Scan(
			&p.ID, &p.MachineID, &p.AssemblyID, &p.Department, &p.PartNumber,
			&p.Description, &p.QtyRequired, &p.QtyPicked, &p.Status,
			&p.FulfilledAt, &p.FulfilledBy,
		); err != nil {
			return nil, fmt.Errorf("failed to scan kitting part: %w", err)
		}
		parts = append(parts, p)
	}
	return parts, nil
}

func (r *sqlRepository) AddPartToAssembly(ctx context.Context, p *models.KittingPart) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.Status == "" {
		p.Status = "pending"
	}
	if p.Department == "" {
		p.Department = "assembly"
	}
	query := `
		INSERT INTO kitting_parts (
			id, machine_id, assembly_id, department, part_number, description, 
			qty_required, qty_picked, status
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9
		)
	`
	_, err := r.db.ExecContext(
		ctx, query,
		p.ID, p.MachineID, p.AssemblyID, p.Department, p.PartNumber,
		p.Description, p.QtyRequired, p.QtyPicked, p.Status,
	)
	return err
}

func (r *sqlRepository) UpdateKittingPartPick(ctx context.Context, partID uuid.UUID, qtyPicked int, fulfilledBy string) (*models.KittingPart, error) {
	// First get the part
	var p models.KittingPart
	query := `
		SELECT id, machine_id, assembly_id, department, part_number, COALESCE(description, ''), 
		       qty_required, qty_picked, status
		FROM kitting_parts
		WHERE id = $1
	`
	err := r.db.QueryRowContext(ctx, query, partID).Scan(
		&p.ID, &p.MachineID, &p.AssemblyID, &p.Department, &p.PartNumber,
		&p.Description, &p.QtyRequired, &p.QtyPicked, &p.Status,
	)
	if err != nil {
		return nil, fmt.Errorf("part not found: %w", err)
	}

	p.QtyPicked = qtyPicked
	if p.QtyPicked >= p.QtyRequired {
		p.Status = "fulfilled"
		now := time.Now()
		p.FulfilledAt = &now
		if fulfilledBy != "" {
			p.FulfilledBy = &fulfilledBy
		}
	} else if p.QtyPicked > 0 {
		p.Status = "in_progress"
		p.FulfilledAt = nil
	} else {
		p.Status = "pending"
		p.FulfilledAt = nil
	}

	updateQuery := `
		UPDATE kitting_parts
		SET qty_picked = $2, status = $3, fulfilled_at = $4, fulfilled_by = $5
		WHERE id = $1
	`
	_, err = r.db.ExecContext(ctx, updateQuery, p.ID, p.QtyPicked, p.Status, p.FulfilledAt, p.FulfilledBy)
	if err != nil {
		return nil, fmt.Errorf("failed to update kitting part pick: %w", err)
	}

	return &p, nil
}

func (r *sqlRepository) BatchInsert(ctx context.Context, machineID uuid.UUID, nodes []models.ParsedBOMNode) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// Map of AssemblyCode -> generated UUID
	codeToID := make(map[string]uuid.UUID)

	// First pass: insert all assemblies
	for i, n := range nodes {
		asmID := uuid.New()
		codeToID[n.AssemblyCode] = asmID

		var parentID *uuid.UUID
		if n.ParentCode != "" {
			if pid, ok := codeToID[n.ParentCode]; ok {
				parentID = &pid
			}
		}

		dept := n.Department
		if dept == "" {
			dept = "assembly"
		}
		rev := n.Revision
		if rev == "" {
			rev = "A"
		}

		insertAsm := `
			INSERT INTO machine_assemblies (
				id, machine_id, parent_assembly_id, assembly_code, name, 
				description, drawing_number, revision, department, quoted_hours, 
				status, sequence_order, created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
			)
		`
		_, err := tx.ExecContext(
			ctx, insertAsm,
			asmID, machineID, parentID, n.AssemblyCode, n.Name,
			n.Description, n.DrawingNumber, rev, dept, n.QuotedHours,
			models.AssemblyStatusDesignDraft, i+1,
		)
		if err != nil {
			return fmt.Errorf("failed to insert assembly %s: %w", n.AssemblyCode, err)
		}

		// Insert any parts attached to this node
		for _, part := range n.Parts {
			insertPart := `
				INSERT INTO kitting_parts (
					id, machine_id, assembly_id, department, part_number, description, 
					qty_required, qty_picked, status
				) VALUES (
					$1, $2, $3, $4, $5, $6, $7, 0, 'pending'
				)
			`
			_, err := tx.ExecContext(
				ctx, insertPart,
				uuid.New(), machineID, asmID, dept, part.PartNumber,
				part.Description, part.QtyRequired,
			)
			if err != nil {
				return fmt.Errorf("failed to insert part %s for assembly %s: %w", part.PartNumber, n.AssemblyCode, err)
			}
		}
	}

	return tx.Commit()
}
