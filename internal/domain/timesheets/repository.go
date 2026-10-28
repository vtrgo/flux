package timesheets

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrTimesheetNotFound = errors.New("Weekly timesheet not found")
	ErrForbidden         = errors.New("Forbidden: You cannot modify another user's timesheet")
	ErrAlreadyApproved   = errors.New("Cannot modify timesheet: it has already been approved and locked into payroll ledger.")
	ErrZeroHoursSubmit   = errors.New("Cannot submit timesheet with 0 hours logged")
	ErrInvalidHours      = errors.New("Each entry hours_spent must be greater than 0 and at most 24")
)

type Repository interface {
	// Department Tasks
	GetDepartmentTasks(ctx context.Context, department string, activeOnly bool) ([]models.DepartmentTask, error)
	CreateDepartmentTask(ctx context.Context, req models.CreateDepartmentTaskRequest, createdBy *uuid.UUID) (models.DepartmentTask, error)
	UpdateDepartmentTask(ctx context.Context, id uuid.UUID, req models.UpdateDepartmentTaskRequest) (models.DepartmentTask, error)
	DeleteDepartmentTask(ctx context.Context, id uuid.UUID) error

	// Project Tasks & Quoting
	GetMachineTasks(ctx context.Context, machineID uuid.UUID) ([]models.ProjectTask, error)
	CreateProjectTask(ctx context.Context, machineID uuid.UUID, req models.CreateProjectTaskRequest, createdBy *uuid.UUID) (models.ProjectTask, error)
	UpdateTaskQuote(ctx context.Context, taskID uuid.UUID, req models.UpdateTaskQuoteRequest) (models.ProjectTask, error)
	GetMachineLaborSummary(ctx context.Context, machineID uuid.UUID) (models.MachineLaborSummary, error)
	GetQuotingReviewReport(ctx context.Context) ([]models.MachineLaborSummary, error)
	GetMachineLaborCorrelation(ctx context.Context, machineID uuid.UUID) (models.MachineLaborCorrelationReport, error)

	// Time Entries
	CreateTimeEntry(ctx context.Context, userID uuid.UUID, req models.CreateTimeEntryRequest) (models.TimeEntry, error)
	GetTimeEntries(ctx context.Context, userID *uuid.UUID, machineID *uuid.UUID, startDate, endDate string) ([]models.TimeEntry, error)
	DeleteTimeEntry(ctx context.Context, id uuid.UUID, userID uuid.UUID, isAdminOrManager bool) error

	// Weekly Timesheets
	FetchWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) (*models.WeeklyTimesheet, error)
	GetOrCreateWeeklyTimesheet(ctx context.Context, userID uuid.UUID, weekStart string) (*models.WeeklyTimesheet, error)
	SaveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, req models.WeeklyTimesheetSaveRequest, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error)
	SubmitWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserUUID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error)
	WithdrawWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error)
	GetTimesheetApprovals(ctx context.Context, deptFilter, statusFilter, weekStartFilter string) ([]models.WeeklyTimesheet, error)
	ApproveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, approverID uuid.UUID) (*models.WeeklyTimesheet, error)
	RejectWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, reason string) (*models.WeeklyTimesheet, error)
	DeleteWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) error
}

type sqlRepository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) GetDepartmentTasks(ctx context.Context, department string, activeOnly bool) ([]models.DepartmentTask, error) {
	query := `
		SELECT id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
		FROM department_tasks
		WHERE 1=1
	`
	var args []interface{}
	if department != "" && department != "all" {
		query += " AND (department = $1 OR (LOWER(department) IN ('controls', 'electrical-controls', 'electrical_controls') AND LOWER($1) IN ('controls', 'electrical-controls', 'electrical_controls')))"
		args = append(args, department)
	}

	if activeOnly {
		query += " AND is_active = true"
	}

	query += " ORDER BY department ASC, task_name ASC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]models.DepartmentTask, 0)
	for rows.Next() {
		var t models.DepartmentTask
		var desc sql.NullString
		var createdBy uuid.NullUUID
		if err := rows.Scan(
			&t.ID, &t.Department, &t.TaskCode, &t.TaskName, &desc,
			&t.DefaultQuotedHours, &t.IsActive, &createdBy, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if desc.Valid {
			s := desc.String
			t.Description = &s
		}
		if createdBy.Valid {
			t.CreatedBy = &createdBy.UUID
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (r *sqlRepository) CreateDepartmentTask(ctx context.Context, req models.CreateDepartmentTaskRequest, createdBy *uuid.UUID) (models.DepartmentTask, error) {
	var task models.DepartmentTask
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO department_tasks (department, task_code, task_name, description, default_quoted_hours, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
	`, req.Department, req.TaskCode, req.TaskName, req.Description, req.DefaultQuotedHours, createdBy).Scan(
		&task.ID, &task.Department, &task.TaskCode, &task.TaskName, &task.Description,
		&task.DefaultQuotedHours, &task.IsActive, &task.CreatedBy, &task.CreatedAt, &task.UpdatedAt,
	)
	return task, err
}

func (r *sqlRepository) UpdateDepartmentTask(ctx context.Context, id uuid.UUID, req models.UpdateDepartmentTaskRequest) (models.DepartmentTask, error) {
	var task models.DepartmentTask
	err := r.db.QueryRowContext(ctx, `
		UPDATE department_tasks
		SET 
			department = COALESCE($2, department),
			task_code = COALESCE($3, task_code),
			task_name = COALESCE($4, task_name),
			description = COALESCE($5, description),
			default_quoted_hours = COALESCE($6, default_quoted_hours),
			is_active = COALESCE($7, is_active),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
	`, id, req.Department, req.TaskCode, req.TaskName, req.Description, req.DefaultQuotedHours, req.IsActive).Scan(
		&task.ID, &task.Department, &task.TaskCode, &task.TaskName, &task.Description,
		&task.DefaultQuotedHours, &task.IsActive, &task.CreatedBy, &task.CreatedAt, &task.UpdatedAt,
	)
	return task, err
}

func (r *sqlRepository) DeleteDepartmentTask(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `UPDATE department_tasks SET is_active = false, updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *sqlRepository) GetMachineTasks(ctx context.Context, machineID uuid.UUID) ([]models.ProjectTask, error) {
	query := `
		SELECT 
			pt.id, pt.machine_id, m.order_number, pt.task_id, pt.task_code, pt.task_name, pt.department,
			pt.quoted_hours,
			COALESCE(SUM(te.hours_spent), 0.00) AS actual_hours,
			(COALESCE(SUM(te.hours_spent), 0.00) - pt.quoted_hours) AS variance,
			pt.status, pt.created_by, pt.created_at, pt.updated_at
		FROM project_tasks pt
		JOIN machines m ON pt.machine_id = m.id
		LEFT JOIN time_entries te ON (te.project_task_id = pt.id OR (te.machine_id = pt.machine_id AND te.task_id IS NOT NULL AND te.task_id = pt.task_id)) AND te.entry_type = 'production'
		WHERE pt.machine_id = $1
		GROUP BY pt.id, m.order_number
		ORDER BY pt.created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]models.ProjectTask, 0)
	for rows.Next() {
		var t models.ProjectTask
		var orderNum string
		var createdBy uuid.NullUUID
		var taskID uuid.NullUUID
		if err := rows.Scan(
			&t.ID, &t.MachineID, &orderNum, &taskID, &t.TaskCode, &t.TaskName, &t.Department,
			&t.QuotedHours, &t.ActualHours, &t.Variance, &t.Status, &createdBy,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		t.OrderNumber = orderNum
		if createdBy.Valid {
			t.CreatedBy = &createdBy.UUID
		}
		if taskID.Valid {
			t.TaskID = &taskID.UUID
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (r *sqlRepository) CreateProjectTask(ctx context.Context, machineID uuid.UUID, req models.CreateProjectTaskRequest, createdBy *uuid.UUID) (models.ProjectTask, error) {
	var taskUUID *uuid.UUID = req.TaskID
	if taskUUID == nil {
		var resolvedID uuid.UUID
		if err := r.db.QueryRowContext(ctx, `
			SELECT id FROM department_tasks 
			WHERE (LOWER(REPLACE(REPLACE(department, '-', ''), '_', '')) = LOWER(REPLACE(REPLACE($1, '-', ''), '_', ''))
			       OR (LOWER(department) IN ('controls', 'electrical-controls', 'electrical_controls') AND LOWER($1) IN ('controls', 'electrical-controls', 'electrical_controls')))
			  AND (task_code = $2 OR LOWER(task_name) = LOWER($3))
			LIMIT 1
		`, req.Department, req.TaskCode, req.TaskName).Scan(&resolvedID); err == nil {
			taskUUID = &resolvedID
		}
	}

	var task models.ProjectTask
	var scannedCreatedBy uuid.NullUUID
	var scannedTaskID uuid.NullUUID
	upsertQuery := `
		INSERT INTO project_tasks (machine_id, task_id, task_code, task_name, department, quoted_hours, status, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, NOW(), NOW())
		ON CONFLICT (machine_id, task_code) DO UPDATE
		SET task_id = COALESCE(EXCLUDED.task_id, project_tasks.task_id),
		    task_name = EXCLUDED.task_name,
		    department = EXCLUDED.department,
		    quoted_hours = EXCLUDED.quoted_hours,
		    updated_at = NOW()
		RETURNING id, machine_id, task_id, task_code, task_name, department, quoted_hours, status, created_by, created_at, updated_at
	`

	err := r.db.QueryRowContext(ctx, upsertQuery,
		machineID, taskUUID, req.TaskCode, req.TaskName, req.Department, req.QuotedHours, createdBy,
	).Scan(
		&task.ID, &task.MachineID, &scannedTaskID, &task.TaskCode, &task.TaskName, &task.Department,
		&task.QuotedHours, &task.Status, &scannedCreatedBy, &task.CreatedAt, &task.UpdatedAt,
	)
	if err != nil {
		return task, err
	}

	if scannedTaskID.Valid {
		task.TaskID = &scannedTaskID.UUID
	}
	if scannedCreatedBy.Valid {
		task.CreatedBy = &scannedCreatedBy.UUID
	}

	_ = r.db.QueryRowContext(ctx, `
		SELECT m.order_number, COALESCE(SUM(te.hours_spent), 0.00)
		FROM machines m
		LEFT JOIN time_entries te ON te.project_task_id = $1 AND te.entry_type = 'production'
		WHERE m.id = $2
		GROUP BY m.order_number
	`, task.ID, task.MachineID).Scan(&task.OrderNumber, &task.ActualHours)
	task.Variance = task.ActualHours - task.QuotedHours

	return task, nil
}

func (r *sqlRepository) UpdateTaskQuote(ctx context.Context, taskID uuid.UUID, req models.UpdateTaskQuoteRequest) (models.ProjectTask, error) {
	updateQuery := `
		UPDATE project_tasks
		SET 
			quoted_hours = COALESCE($1, quoted_hours),
			status = COALESCE($2, status),
			updated_at = NOW()
		WHERE id = $3
		RETURNING id, machine_id, task_code, task_name, department, quoted_hours, status, created_by, created_at, updated_at
	`

	var task models.ProjectTask
	var createdBy uuid.NullUUID
	err := r.db.QueryRowContext(ctx, updateQuery, req.QuotedHours, req.Status, taskID).Scan(
		&task.ID, &task.MachineID, &task.TaskCode, &task.TaskName, &task.Department,
		&task.QuotedHours, &task.Status, &createdBy, &task.CreatedAt, &task.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return task, ErrTimesheetNotFound
		}
		return task, err
	}

	if createdBy.Valid {
		task.CreatedBy = &createdBy.UUID
	}

	_ = r.db.QueryRowContext(ctx, `
		SELECT m.order_number, COALESCE(SUM(te.hours_spent), 0.00)
		FROM machines m
		LEFT JOIN time_entries te ON te.project_task_id = $1 AND te.entry_type = 'production'
		WHERE m.id = $2
		GROUP BY m.order_number
	`, task.ID, task.MachineID).Scan(&task.OrderNumber, &task.ActualHours)
	task.Variance = task.ActualHours - task.QuotedHours

	return task, nil
}

func (r *sqlRepository) GetMachineLaborSummary(ctx context.Context, machineID uuid.UUID) (models.MachineLaborSummary, error) {
	var s models.MachineLaborSummary
	s.MachineID = machineID

	err := r.db.QueryRowContext(ctx, `SELECT order_number, model_type, status FROM machines WHERE id = $1`, machineID).Scan(&s.OrderNumber, &s.ModelType, &s.Status)
	if err != nil {
		return s, err
	}

	_ = r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(quoted_hours), 0.0) FROM project_tasks WHERE machine_id = $1`, machineID).Scan(&s.TotalQuotedHours)

	row := r.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN entry_type = 'production' THEN hours_spent ELSE 0 END), 0.0),
			COALESCE(SUM(CASE WHEN entry_type = 'rework' THEN hours_spent ELSE 0 END), 0.0),
			COALESCE(SUM(CASE WHEN entry_type = 'issue_fix' THEN hours_spent ELSE 0 END), 0.0),
			COALESCE(SUM(hours_spent), 0.0)
		FROM time_entries
		WHERE machine_id = $1
	`, machineID)
	_ = row.Scan(&s.TotalProductionHours, &s.TotalReworkHours, &s.TotalIssueFixHours, &s.TotalActualHours)

	s.ProductionVariance = s.TotalProductionHours - s.TotalQuotedHours

	tasks, err := r.GetMachineTasks(ctx, machineID)
	if err == nil {
		s.Tasks = tasks
	}
	return s, nil
}

func (r *sqlRepository) GetQuotingReviewReport(ctx context.Context) ([]models.MachineLaborSummary, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id FROM machines ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := make([]models.MachineLaborSummary, 0)
	for rows.Next() {
		var mid uuid.UUID
		if err := rows.Scan(&mid); err == nil {
			if s, err := r.GetMachineLaborSummary(ctx, mid); err == nil {
				summaries = append(summaries, s)
			}
		}
	}
	return summaries, nil
}

func (r *sqlRepository) GetMachineLaborCorrelation(ctx context.Context, machineID uuid.UUID) (models.MachineLaborCorrelationReport, error) {
	var report models.MachineLaborCorrelationReport
	report.MachineID = machineID
	report.Tasks = make([]models.LaborCorrelationItem, 0)
	report.DepartmentBreakdown = make(map[string]models.DepartmentRollup)

	// Fetch machine info
	err := r.db.QueryRowContext(ctx, `
		SELECT order_number, model_type, status FROM machines WHERE id = $1
	`, machineID).Scan(&report.OrderNumber, &report.ModelType, &report.Status)
	if err != nil {
		if err == sql.ErrNoRows {
			return report, ErrTimesheetNotFound
		}
		return report, err
	}

	correlationQuery := `
		WITH assigned AS (
			SELECT 
				pt.id AS project_task_id,
				pt.task_id,
				COALESCE(dt.task_code, pt.task_code) AS task_code,
				COALESCE(dt.task_name, pt.task_name) AS task_name,
				COALESCE(dt.department, pt.department) AS department,
				COALESCE(pt.quoted_hours, 0.00) AS assigned_hours,
				COALESCE(pt.task_id::text, pt.task_code) AS correlation_key
			FROM project_tasks pt
			LEFT JOIN department_tasks dt ON pt.task_id = dt.id
			WHERE pt.machine_id = $1
		),
		consumed AS (
			SELECT 
				COALESCE(te.task_id, pt.task_id) AS task_id,
				COALESCE(dt.task_code, pt.task_code, 'custom') AS task_code,
				COALESCE(dt.task_name, pt.task_name, te.work_description, 'General Task') AS task_name,
				COALESCE(dt.department, pt.department, 'unassigned') AS department,
				COALESCE(SUM(te.hours_spent), 0.00) AS consumed_hours,
				COALESCE(COALESCE(te.task_id, pt.task_id)::text, COALESCE(dt.task_code, pt.task_code, te.work_description)) AS correlation_key
			FROM time_entries te
			LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
			LEFT JOIN department_tasks dt ON COALESCE(te.task_id, pt.task_id) = dt.id
			WHERE te.machine_id = $1 AND te.entry_type = 'production'
			GROUP BY 
				COALESCE(te.task_id, pt.task_id),
				COALESCE(dt.task_code, pt.task_code, 'custom'),
				COALESCE(dt.task_name, pt.task_name, te.work_description, 'General Task'),
				COALESCE(dt.department, pt.department, 'unassigned'),
				COALESCE(COALESCE(te.task_id, pt.task_id)::text, COALESCE(dt.task_code, pt.task_code, te.work_description))
		)
		SELECT 
			COALESCE(a.task_id, c.task_id) AS task_id,
			COALESCE(a.task_code, c.task_code) AS task_code,
			COALESCE(a.task_name, c.task_name) AS task_name,
			COALESCE(a.department, c.department) AS department,
			COALESCE(a.assigned_hours, 0.00) AS assigned_hours,
			COALESCE(c.consumed_hours, 0.00) AS consumed_hours,
			a.project_task_id
		FROM assigned a
		FULL OUTER JOIN consumed c ON a.correlation_key = c.correlation_key
		ORDER BY COALESCE(a.department, c.department) ASC, COALESCE(a.task_name, c.task_name) ASC
	`

	rows, err := r.db.QueryContext(ctx, correlationQuery, machineID)
	if err != nil {
		return report, err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.LaborCorrelationItem
		var taskID uuid.NullUUID
		var ptID uuid.NullUUID
		if err := rows.Scan(
			&taskID, &item.TaskCode, &item.TaskName, &item.Department,
			&item.AssignedHours, &item.ConsumedHours, &ptID,
		); err != nil {
			return report, err
		}

		if taskID.Valid {
			item.TaskID = &taskID.UUID
		}
		if ptID.Valid {
			item.ProjectTaskID = &ptID.UUID
		}

		item.Variance = item.ConsumedHours - item.AssignedHours
		if item.AssignedHours > 0 {
			item.BurnPercentage = (item.ConsumedHours / item.AssignedHours) * 100.0
			if item.ConsumedHours == 0 {
				item.Status = models.CorrelationStatusBudgetedUnstarted
			} else if item.ConsumedHours > item.AssignedHours {
				item.Status = models.CorrelationStatusOverBudget
			} else if item.BurnPercentage >= 85.0 {
				item.Status = models.CorrelationStatusNearingLimit
			} else {
				item.Status = models.CorrelationStatusOnTrack
			}
		} else {
			item.BurnPercentage = 0.0
			item.Status = models.CorrelationStatusUnbudgeted
		}

		report.TotalAssignedHours += item.AssignedHours
		report.TotalConsumedHours += item.ConsumedHours
		report.Tasks = append(report.Tasks, item)

		deptRollup, exists := report.DepartmentBreakdown[item.Department]
		if !exists {
			deptRollup = models.DepartmentRollup{Department: item.Department}
		}
		deptRollup.AssignedHours += item.AssignedHours
		deptRollup.ConsumedHours += item.ConsumedHours
		deptRollup.Variance = deptRollup.ConsumedHours - deptRollup.AssignedHours
		if deptRollup.AssignedHours > 0 {
			deptRollup.BurnPercentage = (deptRollup.ConsumedHours / deptRollup.AssignedHours) * 100.0
		}
		report.DepartmentBreakdown[item.Department] = deptRollup
	}

	report.NetVariance = report.TotalConsumedHours - report.TotalAssignedHours
	if report.TotalAssignedHours > 0 {
		report.OverallBurnPercentage = (report.TotalConsumedHours / report.TotalAssignedHours) * 100.0
	}

	return report, nil
}

func (r *sqlRepository) CreateTimeEntry(ctx context.Context, userID uuid.UUID, req models.CreateTimeEntryRequest) (models.TimeEntry, error) {
	if req.HoursSpent <= 0 || req.HoursSpent > 24 {
		return models.TimeEntry{}, ErrInvalidHours
	}

	if req.EntryType == "" {
		req.EntryType = models.TimeEntryTypeProduction
	}

	var machineID *uuid.UUID = req.MachineID
	switch req.EntryType {
	case models.TimeEntryTypeProduction:
		if req.ProjectTaskID == nil && req.TaskID == nil && strings.TrimSpace(req.WorkDescription) == "" {
			return models.TimeEntry{}, errors.New("task or project_task_id is required for production time entries")
		}
		if machineID == nil && req.ProjectTaskID != nil {
			var mID uuid.UUID
			if err := r.db.QueryRowContext(ctx, `SELECT machine_id FROM project_tasks WHERE id = $1`, req.ProjectTaskID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}
		if machineID == nil {
			return models.TimeEntry{}, errors.New("machine_id is required for production time entries")
		}
		if req.ProjectTaskID == nil {
			var ptID uuid.UUID
			if req.TaskID != nil {
				if err := r.db.QueryRowContext(ctx, `
					SELECT id FROM project_tasks WHERE machine_id = $1 AND task_id = $2 LIMIT 1
				`, *machineID, *req.TaskID).Scan(&ptID); err == nil {
					req.ProjectTaskID = &ptID
				}
			}
			if req.ProjectTaskID == nil && req.WorkDescription != "" {
				if err := r.db.QueryRowContext(ctx, `
					SELECT id FROM project_tasks WHERE machine_id = $1 AND (task_name = $2 OR task_code = $2) LIMIT 1
				`, *machineID, req.WorkDescription).Scan(&ptID); err == nil {
					req.ProjectTaskID = &ptID
				}
			}
		}
	case models.TimeEntryTypeRework:
		if req.ReworkItemID == nil {
			return models.TimeEntry{}, errors.New("rework_item_id is required for rework time entries")
		}
		if machineID == nil {
			var mID uuid.NullUUID
			if err := r.db.QueryRowContext(ctx, `SELECT machine_id FROM rework_items WHERE id = $1`, req.ReworkItemID).Scan(&mID); err == nil && mID.Valid {
				machineID = &mID.UUID
			}
		}
	case models.TimeEntryTypeIssueFix:
		if req.DefectID == nil {
			return models.TimeEntry{}, errors.New("defect_id is required for issue resolution time entries")
		}
		if machineID == nil {
			var mID uuid.UUID
			if err := r.db.QueryRowContext(ctx, `SELECT machine_id FROM defects WHERE id = $1`, req.DefectID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}
	case models.TimeEntryTypeIndirect:
		// Machine ID is optional
	default:
		return models.TimeEntry{}, fmt.Errorf("Unsupported entry_type: %s", req.EntryType)
	}

	workDate := req.WorkDate
	if workDate == "" {
		workDate = time.Now().Format("2006-01-02")
	}

	var weeklyTimesheetID uuid.UUID
	_ = r.db.QueryRowContext(ctx, `
		INSERT INTO weekly_timesheets (user_id, week_start_date, status, total_hours, created_at, updated_at)
		VALUES ($1, ($2::date - EXTRACT(DOW FROM $2::date)::integer * INTERVAL '1 day')::date, 'draft', 0.00, NOW(), NOW())
		ON CONFLICT (user_id, week_start_date) DO UPDATE
		SET updated_at = weekly_timesheets.updated_at
		RETURNING id
	`, userID, workDate).Scan(&weeklyTimesheetID)

	var authorTaskID *uuid.UUID = req.TaskID
	if authorTaskID == nil && req.ProjectTaskID != nil {
		var resolvedTaskID uuid.NullUUID
		_ = r.db.QueryRowContext(ctx, `SELECT task_id FROM project_tasks WHERE id = $1`, req.ProjectTaskID).Scan(&resolvedTaskID)
		if resolvedTaskID.Valid {
			authorTaskID = &resolvedTaskID.UUID
		}
	}
	if authorTaskID == nil && req.WorkDescription != "" {
		var resolvedTaskID uuid.UUID
		if err := r.db.QueryRowContext(ctx, `
			SELECT id FROM department_tasks WHERE (task_name = $1 OR task_code = $1) ORDER BY is_active DESC LIMIT 1
		`, req.WorkDescription).Scan(&resolvedTaskID); err == nil {
			authorTaskID = &resolvedTaskID
		}
	}

	insertQuery := `
		INSERT INTO time_entries (
			user_id, weekly_timesheet_id, machine_id, assembly_id, entry_type, project_task_id, task_id, rework_item_id, defect_id,
			work_date, hours_spent, work_description, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		RETURNING id, user_id, weekly_timesheet_id, machine_id, assembly_id, entry_type, project_task_id, task_id, rework_item_id, defect_id,
		          work_date, hours_spent, work_description, created_at, updated_at
	`

	var entry models.TimeEntry
	var mID, asmID, taskID, aTaskID, rwID, defID, wtID uuid.NullUUID
	var wDate time.Time

	var wtIDParam *uuid.UUID
	if weeklyTimesheetID != uuid.Nil {
		wtIDParam = &weeklyTimesheetID
	}

	var asmIDParam *uuid.UUID
	if req.AssemblyID != nil && *req.AssemblyID != uuid.Nil {
		asmIDParam = req.AssemblyID
	}

	err := r.db.QueryRowContext(ctx, insertQuery,
		userID, wtIDParam, machineID, asmIDParam, req.EntryType, req.ProjectTaskID, authorTaskID, req.ReworkItemID, req.DefectID,
		workDate, req.HoursSpent, req.WorkDescription,
	).Scan(
		&entry.ID, &entry.UserID, &wtID, &mID, &asmID, &entry.EntryType, &taskID, &aTaskID, &rwID, &defID,
		&wDate, &entry.HoursSpent, &entry.WorkDescription, &entry.CreatedAt, &entry.UpdatedAt,
	)
	if err != nil {
		return models.TimeEntry{}, err
	}

	entry.WorkDate = wDate.Format("2006-01-02")
	if wtID.Valid {
		entry.WeeklyTimesheetID = &wtID.UUID
	}
	if aTaskID.Valid {
		entry.TaskID = &aTaskID.UUID
	}
	if asmID.Valid {
		entry.AssemblyID = &asmID.UUID
		_ = r.db.QueryRowContext(ctx, `SELECT assembly_code, name FROM machine_assemblies WHERE id = $1`, asmID.UUID).Scan(&entry.AssemblyCode, &entry.AssemblyName)
	}
	if weeklyTimesheetID != uuid.Nil {
		_, _ = r.db.ExecContext(ctx, `
			UPDATE weekly_timesheets
			SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, weeklyTimesheetID)
	}

	if mID.Valid {
		entry.MachineID = &mID.UUID
		_ = r.db.QueryRowContext(ctx, `SELECT order_number FROM machines WHERE id = $1`, mID.UUID).Scan(&entry.OrderNumber)
	}
	if taskID.Valid {
		entry.ProjectTaskID = &taskID.UUID
		_ = r.db.QueryRowContext(ctx, `SELECT task_name FROM project_tasks WHERE id = $1`, taskID.UUID).Scan(&entry.TaskName)
	}
	if rwID.Valid {
		entry.ReworkItemID = &rwID.UUID
		_ = r.db.QueryRowContext(ctx, `SELECT part_number FROM rework_items WHERE id = $1`, rwID.UUID).Scan(&entry.ReworkPartNum)

		_, _ = r.db.ExecContext(ctx, `
			UPDATE rework_items 
			SET actual_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE rework_item_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, rwID.UUID)
	}
	if defID.Valid {
		entry.DefectID = &defID.UUID
	}

	_ = r.db.QueryRowContext(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&entry.UserName)
	return entry, nil
}

func (r *sqlRepository) GetTimeEntries(ctx context.Context, userID *uuid.UUID, machineID *uuid.UUID, startDate, endDate string) ([]models.TimeEntry, error) {
	query := `
		SELECT te.id, te.user_id, u.username, te.machine_id, COALESCE(m.order_number, ''),
		       te.assembly_id, COALESCE(ma.assembly_code, ''), COALESCE(ma.name, ''),
		       te.entry_type, te.project_task_id, te.task_id,
		       COALESCE(pt.task_name, dt.task_name, te.work_description),
		       COALESCE(pt.department, dt.department, ''),
		       te.rework_item_id, COALESCE(rw.part_number, ''),
		       te.defect_id,
		       to_char(te.work_date, 'YYYY-MM-DD'), te.hours_spent, te.work_description,
		       te.created_at, te.updated_at
		FROM time_entries te
		JOIN users u ON te.user_id = u.id
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN machine_assemblies ma ON te.assembly_id = ma.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if userID != nil {
		query += fmt.Sprintf(" AND te.user_id = $%d", argIdx)
		args = append(args, *userID)
		argIdx++
	}
	if machineID != nil {
		query += fmt.Sprintf(" AND te.machine_id = $%d", argIdx)
		args = append(args, *machineID)
		argIdx++
	}
	if startDate != "" {
		query += fmt.Sprintf(" AND te.work_date >= $%d::date", argIdx)
		args = append(args, startDate)
		argIdx++
	}
	if endDate != "" {
		query += fmt.Sprintf(" AND te.work_date <= $%d::date", argIdx)
		args = append(args, endDate)
	}

	query += " ORDER BY te.work_date DESC, te.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]models.TimeEntry, 0)
	for rows.Next() {
		var e models.TimeEntry
		var mID, asmID, ptID, tID, rwID, defID uuid.NullUUID
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.UserName, &mID, &e.OrderNumber,
			&asmID, &e.AssemblyCode, &e.AssemblyName,
			&e.EntryType, &ptID, &tID, &e.TaskName, &e.Department,
			&rwID, &e.ReworkPartNum, &defID,
			&e.WorkDate, &e.HoursSpent, &e.WorkDescription,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if mID.Valid {
			e.MachineID = &mID.UUID
		}
		if asmID.Valid {
			e.AssemblyID = &asmID.UUID
		}
		if ptID.Valid {
			e.ProjectTaskID = &ptID.UUID
		}
		if tID.Valid {
			e.TaskID = &tID.UUID
		}
		if rwID.Valid {
			e.ReworkItemID = &rwID.UUID
		}
		if defID.Valid {
			e.DefectID = &defID.UUID
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *sqlRepository) DeleteTimeEntry(ctx context.Context, id uuid.UUID, userID uuid.UUID, isAdminOrManager bool) error {
	var ownerID uuid.UUID
	var rwID, wtID uuid.NullUUID
	err := r.db.QueryRowContext(ctx, `
		SELECT user_id, rework_item_id, weekly_timesheet_id FROM time_entries WHERE id = $1
	`, id).Scan(&ownerID, &rwID, &wtID)
	if err != nil {
		if err == sql.ErrNoRows {
			return ErrTimesheetNotFound
		}
		return err
	}

	if ownerID != userID && !isAdminOrManager {
		return ErrForbidden
	}

	_, err = r.db.ExecContext(ctx, `DELETE FROM time_entries WHERE id = $1`, id)
	if err != nil {
		return err
	}

	if rwID.Valid {
		_, _ = r.db.ExecContext(ctx, `
			UPDATE rework_items 
			SET actual_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE rework_item_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, rwID.UUID)
	}

	if wtID.Valid {
		_, _ = r.db.ExecContext(ctx, `
			UPDATE weekly_timesheets
			SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, wtID.UUID)
	}

	return nil
}

func (r *sqlRepository) FetchWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) (*models.WeeklyTimesheet, error) {
	query := `
		SELECT 
			wt.id, wt.user_id, u.username, COALESCE(u.email, ''), COALESCE(u.department, ''),
			to_char(wt.week_start_date, 'YYYY-MM-DD'),
			wt.status, wt.total_hours, COALESCE(wt.notes, ''),
			wt.submitted_at, wt.submitted_by,
			wt.approved_at, wt.approved_by, COALESCE(appr.username, ''),
			COALESCE(wt.rejection_reason, ''),
			wt.created_at, wt.updated_at
		FROM weekly_timesheets wt
		JOIN users u ON wt.user_id = u.id
		LEFT JOIN users appr ON wt.approved_by = appr.id
		WHERE wt.id = $1
	`
	var wt models.WeeklyTimesheet
	var submittedBy, approvedBy uuid.NullUUID
	err := r.db.QueryRowContext(ctx, query, timesheetID).Scan(
		&wt.ID, &wt.UserID, &wt.UserName, &wt.UserEmail, &wt.Department,
		&wt.WeekStartDate,
		&wt.Status, &wt.TotalHours, &wt.Notes,
		&wt.SubmittedAt, &submittedBy,
		&wt.ApprovedAt, &approvedBy, &wt.ApproverName,
		&wt.RejectionReason,
		&wt.CreatedAt, &wt.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if submittedBy.Valid {
		wt.SubmittedBy = &submittedBy.UUID
	}
	if approvedBy.Valid {
		wt.ApprovedBy = &approvedBy.UUID
	}

	entriesQuery := `
		SELECT 
			te.id, te.user_id, u.username, te.weekly_timesheet_id, te.machine_id, COALESCE(m.order_number, ''),
			te.assembly_id, COALESCE(ma.assembly_code, ''), COALESCE(ma.name, ''),
			te.entry_type, te.project_task_id, te.task_id,
			COALESCE(dt.task_name, pt.task_name, te.work_description, 'General Task'),
			COALESCE(dt.department, pt.department, ''),
			te.rework_item_id, COALESCE(rw.part_number, ''),
			te.defect_id,
			to_char(te.work_date, 'YYYY-MM-DD'), te.hours_spent, COALESCE(te.work_description, ''),
			te.created_at, te.updated_at
		FROM time_entries te
		JOIN users u ON te.user_id = u.id
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN machine_assemblies ma ON te.assembly_id = ma.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		WHERE te.weekly_timesheet_id = $1
		ORDER BY te.work_date ASC, te.created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, entriesQuery, timesheetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	wt.Entries = make([]models.TimeEntry, 0)
	for rows.Next() {
		var e models.TimeEntry
		var wtID, mID, asmID, ptID, tID, rwID, defID uuid.NullUUID
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.UserName, &wtID, &mID, &e.OrderNumber,
			&asmID, &e.AssemblyCode, &e.AssemblyName,
			&e.EntryType, &ptID, &tID, &e.TaskName,
			&e.Department,
			&rwID, &e.ReworkPartNum,
			&defID,
			&e.WorkDate, &e.HoursSpent, &e.WorkDescription,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if wtID.Valid {
			e.WeeklyTimesheetID = &wtID.UUID
		}
		if mID.Valid {
			e.MachineID = &mID.UUID
		}
		if asmID.Valid {
			e.AssemblyID = &asmID.UUID
		}
		if ptID.Valid {
			e.ProjectTaskID = &ptID.UUID
		}
		if tID.Valid {
			e.TaskID = &tID.UUID
		}
		if rwID.Valid {
			e.ReworkItemID = &rwID.UUID
		}
		if defID.Valid {
			e.DefectID = &defID.UUID
		}
		wt.Entries = append(wt.Entries, e)
	}

	return &wt, nil
}

func (r *sqlRepository) GetOrCreateWeeklyTimesheet(ctx context.Context, userID uuid.UUID, weekStart string) (*models.WeeklyTimesheet, error) {
	var wtID uuid.UUID
	err := r.db.QueryRowContext(ctx, `
		SELECT id FROM weekly_timesheets 
		WHERE user_id = $1 AND week_start_date = $2::date
	`, userID, weekStart).Scan(&wtID)

	if err == sql.ErrNoRows {
		err = r.db.QueryRowContext(ctx, `
			INSERT INTO weekly_timesheets (user_id, week_start_date, status, total_hours)
			VALUES ($1, $2::date, 'draft', 0.0)
			RETURNING id
		`, userID, weekStart).Scan(&wtID)
		if err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, wtID)
}

func (r *sqlRepository) SaveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, req models.WeeklyTimesheetSaveRequest, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	var ownerID uuid.UUID
	var status string
	var weekStartDate time.Time
	err := r.db.QueryRowContext(ctx, `
		SELECT user_id, status, week_start_date FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status, &weekStartDate)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrTimesheetNotFound
		}
		return nil, err
	}

	if ownerID.String() != authUserID && !isAdminOrManager {
		return nil, ErrForbidden
	}

	if status == string(models.WeeklyTimesheetStatusApproved) {
		return nil, ErrAlreadyApproved
	}

	weekEnd := weekStartDate.AddDate(0, 0, 7)
	for _, entry := range req.Entries {
		if entry.HoursSpent <= 0 || entry.HoursSpent > 24 {
			return nil, ErrInvalidHours
		}
		wDate, err := time.Parse("2006-01-02", entry.WorkDate)
		if err != nil {
			return nil, fmt.Errorf("Invalid work_date format: %s", entry.WorkDate)
		}
		if wDate.Before(weekStartDate) || !wDate.Before(weekEnd) {
			return nil, fmt.Errorf("work_date %s is outside of timesheet week [%s to %s]", entry.WorkDate, weekStartDate.Format("2006-01-02"), weekStartDate.AddDate(0, 0, 6).Format("2006-01-02"))
		}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if req.Notes != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE weekly_timesheets SET notes = $1, updated_at = NOW() WHERE id = $2`, *req.Notes, timesheetID); err != nil {
			return nil, err
		}
	}

	existingRows, err := tx.QueryContext(ctx, `SELECT id, rework_item_id FROM time_entries WHERE weekly_timesheet_id = $1`, timesheetID)
	if err != nil {
		return nil, err
	}
	defer existingRows.Close()

	existingIDs := make(map[uuid.UUID]bool)
	affectedReworkIDs := make(map[uuid.UUID]bool)
	for existingRows.Next() {
		var eid uuid.UUID
		var rwID uuid.NullUUID
		if err := existingRows.Scan(&eid, &rwID); err == nil {
			existingIDs[eid] = true
			if rwID.Valid {
				affectedReworkIDs[rwID.UUID] = true
			}
		}
	}

	keptIDs := make(map[uuid.UUID]bool)

	for _, item := range req.Entries {
		if item.ReworkItemID != nil {
			affectedReworkIDs[*item.ReworkItemID] = true
		}

		entryType := item.EntryType
		if entryType == "" {
			entryType = models.TimeEntryTypeProduction
		}

		machineID := item.MachineID
		if machineID == nil && item.ProjectTaskID != nil {
			var mID uuid.UUID
			if err := tx.QueryRowContext(ctx, `SELECT machine_id FROM project_tasks WHERE id = $1`, item.ProjectTaskID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}

		authorTaskID := item.TaskID
		if authorTaskID == nil && item.ProjectTaskID != nil {
			var ptTaskID uuid.NullUUID
			_ = tx.QueryRowContext(ctx, `SELECT task_id FROM project_tasks WHERE id = $1`, item.ProjectTaskID).Scan(&ptTaskID)
			if ptTaskID.Valid {
				authorTaskID = &ptTaskID.UUID
			}
		}

		if authorTaskID == nil && item.WorkDescription != "" {
			var dtID uuid.UUID
			if err := tx.QueryRowContext(ctx, `
				SELECT id FROM department_tasks
				WHERE (task_name = $1 OR task_code = $1)
				ORDER BY is_active DESC, created_at DESC
				LIMIT 1
			`, item.WorkDescription).Scan(&dtID); err == nil {
				authorTaskID = &dtID
			}
		}

		if item.ProjectTaskID == nil && machineID != nil {
			var ptID uuid.UUID
			if authorTaskID != nil {
				if err := tx.QueryRowContext(ctx, `
					SELECT id FROM project_tasks
					WHERE machine_id = $1 AND task_id = $2
					LIMIT 1
				`, *machineID, *authorTaskID).Scan(&ptID); err == nil {
					item.ProjectTaskID = &ptID
				}
			}
			if item.ProjectTaskID == nil && item.WorkDescription != "" {
				if err := tx.QueryRowContext(ctx, `
					SELECT id FROM project_tasks
					WHERE machine_id = $1 AND (task_name = $2 OR task_code = $2)
					LIMIT 1
				`, *machineID, item.WorkDescription).Scan(&ptID); err == nil {
					item.ProjectTaskID = &ptID
				}
			}
		}

		if item.ID != nil && existingIDs[*item.ID] {
			_, err = tx.ExecContext(ctx, `
				UPDATE time_entries
				SET machine_id = $1, assembly_id = $2, entry_type = $3, project_task_id = $4, task_id = $5,
				    rework_item_id = $6, defect_id = $7,
				    work_date = $8::date, hours_spent = $9, work_description = $10, updated_at = NOW()
				WHERE id = $11 AND weekly_timesheet_id = $12
			`, machineID, item.AssemblyID, entryType, item.ProjectTaskID, authorTaskID, item.ReworkItemID, item.DefectID, item.WorkDate, item.HoursSpent, item.WorkDescription, *item.ID, timesheetID)
			if err != nil {
				return nil, err
			}
			keptIDs[*item.ID] = true
		} else {
			var newEntryID uuid.UUID
			err = tx.QueryRowContext(ctx, `
				INSERT INTO time_entries (
					user_id, weekly_timesheet_id, machine_id, assembly_id, entry_type, project_task_id, task_id,
					rework_item_id, defect_id, work_date, hours_spent, work_description
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12)
				RETURNING id
			`, ownerID, timesheetID, machineID, item.AssemblyID, entryType, item.ProjectTaskID, authorTaskID, item.ReworkItemID, item.DefectID, item.WorkDate, item.HoursSpent, item.WorkDescription).Scan(&newEntryID)
			if err != nil {
				return nil, err
			}
			keptIDs[newEntryID] = true
		}
	}

	for eid := range existingIDs {
		if !keptIDs[eid] {
			if _, err := tx.ExecContext(ctx, `DELETE FROM time_entries WHERE id = $1 AND weekly_timesheet_id = $2`, eid, timesheetID); err != nil {
				return nil, err
			}
		}
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE weekly_timesheets
		SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
		    status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
		    rejection_reason = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_reason END,
		    updated_at = NOW()
		WHERE id = $1
	`, timesheetID)
	if err != nil {
		return nil, err
	}

	for rID := range affectedReworkIDs {
		_, _ = tx.ExecContext(ctx, `
			UPDATE rework_items
			SET actual_hours = (
				SELECT COALESCE(SUM(hours_spent), 0.0) 
				FROM time_entries 
				WHERE rework_item_id = $1
			), updated_at = NOW()
			WHERE id = $1
		`, rID)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (r *sqlRepository) SubmitWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserUUID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	var ownerID uuid.UUID
	var status string
	var totalHours float64
	err := r.db.QueryRowContext(ctx, `
		SELECT user_id, status, total_hours FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status, &totalHours)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrTimesheetNotFound
		}
		return nil, err
	}

	if ownerID.String() != authUserID && !isAdminOrManager {
		return nil, ErrForbidden
	}

	if status != string(models.WeeklyTimesheetStatusDraft) && status != string(models.WeeklyTimesheetStatusRejected) {
		return nil, fmt.Errorf("Cannot submit timesheet with status '%s'", status)
	}

	if totalHours <= 0 {
		return nil, ErrZeroHoursSubmit
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE weekly_timesheets
		SET status = 'submitted', submitted_at = NOW(), submitted_by = $1, rejection_reason = NULL, updated_at = NOW()
		WHERE id = $2
	`, authUserUUID, timesheetID)
	if err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (r *sqlRepository) WithdrawWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	var ownerID uuid.UUID
	var status string
	err := r.db.QueryRowContext(ctx, `
		SELECT user_id, status FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrTimesheetNotFound
		}
		return nil, err
	}

	if ownerID.String() != authUserID && !isAdminOrManager {
		return nil, ErrForbidden
	}

	if status != string(models.WeeklyTimesheetStatusSubmitted) {
		return nil, fmt.Errorf("Cannot withdraw timesheet with status '%s'. Only 'submitted' timesheets can be withdrawn.", status)
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE weekly_timesheets
		SET status = 'draft', submitted_at = NULL, submitted_by = NULL, updated_at = NOW()
		WHERE id = $1
	`, timesheetID)
	if err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (r *sqlRepository) GetTimesheetApprovals(ctx context.Context, deptFilter, statusFilter, weekStartFilter string) ([]models.WeeklyTimesheet, error) {
	query := `
		SELECT 
			wt.id, wt.user_id, u.username, COALESCE(u.email, ''), COALESCE(u.department, ''),
			to_char(wt.week_start_date, 'YYYY-MM-DD'),
			wt.status, wt.total_hours, COALESCE(wt.notes, ''),
			wt.submitted_at, wt.submitted_by,
			wt.approved_at, wt.approved_by, COALESCE(appr.username, ''),
			COALESCE(wt.rejection_reason, ''),
			wt.created_at, wt.updated_at
		FROM weekly_timesheets wt
		JOIN users u ON wt.user_id = u.id
		LEFT JOIN users appr ON wt.approved_by = appr.id
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if deptFilter != "" && deptFilter != "all" {
		query += fmt.Sprintf(" AND u.department = $%d", argIdx)
		args = append(args, deptFilter)
		argIdx++
	}

	if statusFilter == "pending" {
		query += " AND wt.status NOT IN ('approved', 'rejected') AND wt.total_hours > 0"
	} else if statusFilter != "" && statusFilter != "all" {
		query += fmt.Sprintf(" AND wt.status = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}

	if weekStartFilter != "" {
		query += fmt.Sprintf(" AND (wt.week_start_date = $%d::date OR (wt.week_start_date >= ($%d::date - EXTRACT(DOW FROM $%d::date)::integer * INTERVAL '1 day')::date AND wt.week_start_date < ($%d::date - EXTRACT(DOW FROM $%d::date)::integer * INTERVAL '1 day' + INTERVAL '7 days')::date))", argIdx, argIdx, argIdx, argIdx, argIdx)
		args = append(args, weekStartFilter)
	}

	query += " ORDER BY wt.week_start_date DESC, wt.submitted_at DESC, wt.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]models.WeeklyTimesheet, 0)
	for rows.Next() {
		var wt models.WeeklyTimesheet
		var submittedBy, approvedBy uuid.NullUUID
		if err := rows.Scan(
			&wt.ID, &wt.UserID, &wt.UserName, &wt.UserEmail, &wt.Department,
			&wt.WeekStartDate,
			&wt.Status, &wt.TotalHours, &wt.Notes,
			&wt.SubmittedAt, &submittedBy,
			&wt.ApprovedAt, &approvedBy, &wt.ApproverName,
			&wt.RejectionReason,
			&wt.CreatedAt, &wt.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if submittedBy.Valid {
			wt.SubmittedBy = &submittedBy.UUID
		}
		if approvedBy.Valid {
			wt.ApprovedBy = &approvedBy.UUID
		}
		list = append(list, wt)
	}

	return list, nil
}

func (r *sqlRepository) ApproveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, approverID uuid.UUID) (*models.WeeklyTimesheet, error) {
	_, err := r.db.ExecContext(ctx, `
		UPDATE weekly_timesheets
		SET status = 'approved', approved_at = NOW(), approved_by = $1, rejection_reason = NULL, updated_at = NOW()
		WHERE id = $2
	`, approverID, timesheetID)
	if err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (r *sqlRepository) RejectWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, reason string) (*models.WeeklyTimesheet, error) {
	_, err := r.db.ExecContext(ctx, `
		UPDATE weekly_timesheets
		SET status = 'rejected', rejection_reason = $1, approved_at = NULL, approved_by = NULL, updated_at = NOW()
		WHERE id = $2
	`, reason, timesheetID)
	if err != nil {
		return nil, err
	}

	return r.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (r *sqlRepository) DeleteWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM time_entries WHERE weekly_timesheet_id = $1`, timesheetID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM weekly_timesheets WHERE id = $1`, timesheetID); err != nil {
		return err
	}
	return tx.Commit()
}
