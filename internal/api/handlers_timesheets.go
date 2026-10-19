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

// handleGetMachineTasks returns all project tasks for a machine along with their actual hours and variance.
func handleGetMachineTasks(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	query := `
		SELECT 
			pt.id, pt.machine_id, m.order_number, pt.task_code, pt.task_name, pt.department,
			pt.quoted_hours,
			COALESCE(SUM(te.hours_spent), 0.00) AS actual_hours,
			(COALESCE(SUM(te.hours_spent), 0.00) - pt.quoted_hours) AS variance,
			pt.status, pt.created_by, pt.created_at, pt.updated_at
		FROM project_tasks pt
		JOIN machines m ON pt.machine_id = m.id
		LEFT JOIN time_entries te ON te.project_task_id = pt.id AND te.entry_type = 'production'
		WHERE pt.machine_id = $1
		GROUP BY pt.id, m.order_number
		ORDER BY pt.created_at ASC
	`

	rows, err := db.DB.QueryContext(r.Context(), query, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch machine tasks", err)
		return
	}
	defer rows.Close()

	tasks := make([]models.ProjectTask, 0)
	for rows.Next() {
		var t models.ProjectTask
		var orderNum string
		var createdBy uuid.NullUUID
		err := rows.Scan(
			&t.ID, &t.MachineID, &orderNum, &t.TaskCode, &t.TaskName, &t.Department,
			&t.QuotedHours, &t.ActualHours, &t.Variance, &t.Status, &createdBy,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning machine task", err)
			return
		}
		t.OrderNumber = orderNum
		if createdBy.Valid {
			t.CreatedBy = &createdBy.UUID
		}
		tasks = append(tasks, t)
	}

	respondJSON(w, http.StatusOK, tasks)
}

// handleCreateProjectTask adds or updates a quoted task for a machine.
func handleCreateProjectTask(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var req models.CreateProjectTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	if req.TaskCode == "" || req.TaskName == "" || req.Department == "" {
		respondError(w, http.StatusBadRequest, "task_code, task_name, and department are required", nil)
		return
	}
	if req.QuotedHours < 0 {
		respondError(w, http.StatusBadRequest, "quoted_hours cannot be negative", nil)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var creatorUUID *uuid.UUID
	if authUserID != "" {
		if uid, parseErr := uuid.Parse(authUserID); parseErr == nil {
			creatorUUID = &uid
		}
	}

	var task models.ProjectTask
	var createdBy uuid.NullUUID
	upsertQuery := `
		INSERT INTO project_tasks (machine_id, task_code, task_name, department, quoted_hours, status, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'open', $6, NOW(), NOW())
		ON CONFLICT (machine_id, task_code) DO UPDATE
		SET task_name = EXCLUDED.task_name,
		    department = EXCLUDED.department,
		    quoted_hours = EXCLUDED.quoted_hours,
		    updated_at = NOW()
		RETURNING id, machine_id, task_code, task_name, department, quoted_hours, status, created_by, created_at, updated_at
	`

	err = db.DB.QueryRowContext(r.Context(), upsertQuery,
		machineID, req.TaskCode, req.TaskName, req.Department, req.QuotedHours, creatorUUID,
	).Scan(
		&task.ID, &task.MachineID, &task.TaskCode, &task.TaskName, &task.Department,
		&task.QuotedHours, &task.Status, &createdBy, &task.CreatedAt, &task.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create or update project task", err)
		return
	}

	if createdBy.Valid {
		task.CreatedBy = &createdBy.UUID
	}

	// Fetch actual hours & order number
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT m.order_number, COALESCE(SUM(te.hours_spent), 0.00)
		FROM machines m
		LEFT JOIN time_entries te ON te.project_task_id = $1 AND te.entry_type = 'production'
		WHERE m.id = $2
		GROUP BY m.order_number
	`, task.ID, task.MachineID).Scan(&task.OrderNumber, &task.ActualHours)
	task.Variance = task.ActualHours - task.QuotedHours

	BroadcastEvent("timesheet_task_updated", task)
	respondJSON(w, http.StatusCreated, task)
}

// handleUpdateTaskQuote updates quoted hours or status on an existing task.
func handleUpdateTaskQuote(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.PathValue("task_id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	var req models.UpdateTaskQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	if req.QuotedHours == nil && req.Status == nil {
		respondError(w, http.StatusBadRequest, "No fields to update provided", nil)
		return
	}

	if req.QuotedHours != nil && *req.QuotedHours < 0 {
		respondError(w, http.StatusBadRequest, "quoted_hours cannot be negative", nil)
		return
	}

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
	err = db.DB.QueryRowContext(r.Context(), updateQuery, req.QuotedHours, req.Status, taskID).Scan(
		&task.ID, &task.MachineID, &task.TaskCode, &task.TaskName, &task.Department,
		&task.QuotedHours, &task.Status, &createdBy, &task.CreatedAt, &task.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Project task not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update project task", err)
		return
	}

	if createdBy.Valid {
		task.CreatedBy = &createdBy.UUID
	}

	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT m.order_number, COALESCE(SUM(te.hours_spent), 0.00)
		FROM machines m
		LEFT JOIN time_entries te ON te.project_task_id = $1 AND te.entry_type = 'production'
		WHERE m.id = $2
		GROUP BY m.order_number
	`, task.ID, task.MachineID).Scan(&task.OrderNumber, &task.ActualHours)
	task.Variance = task.ActualHours - task.QuotedHours

	BroadcastEvent("timesheet_task_updated", task)
	respondJSON(w, http.StatusOK, task)
}

// handleCreateTimeEntry creates a universal time entry for production, rework, or issue resolution.
func handleCreateTimeEntry(w http.ResponseWriter, r *http.Request) {
	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized: Authentication required to log time", nil)
		return
	}
	userUUID, err := uuid.Parse(authUserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid user authentication", err)
		return
	}

	var req models.CreateTimeEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	if req.HoursSpent <= 0 || req.HoursSpent > 24 {
		respondError(w, http.StatusBadRequest, "hours_spent must be greater than 0 and less than or equal to 24", nil)
		return
	}

	if req.EntryType == "" {
		req.EntryType = models.TimeEntryTypeProduction
	}

	// Validate matching entity according to entry_type
	var machineID *uuid.UUID = req.MachineID
	switch req.EntryType {
	case models.TimeEntryTypeProduction:
		if req.ProjectTaskID == nil {
			respondError(w, http.StatusBadRequest, "project_task_id is required for production time entries", nil)
			return
		}
		// Resolve machine_id from project_task if missing
		if machineID == nil {
			var mID uuid.UUID
			if err := db.DB.QueryRowContext(r.Context(), `SELECT machine_id FROM project_tasks WHERE id = $1`, req.ProjectTaskID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}
	case models.TimeEntryTypeRework:
		if req.ReworkItemID == nil {
			respondError(w, http.StatusBadRequest, "rework_item_id is required for rework time entries", nil)
			return
		}
		// Resolve machine_id from rework_items if missing
		if machineID == nil {
			var mID uuid.NullUUID
			if err := db.DB.QueryRowContext(r.Context(), `SELECT machine_id FROM rework_items WHERE id = $1`, req.ReworkItemID).Scan(&mID); err == nil && mID.Valid {
				machineID = &mID.UUID
			}
		}
	case models.TimeEntryTypeIssueFix:
		if req.DefectID == nil {
			respondError(w, http.StatusBadRequest, "defect_id is required for issue resolution time entries", nil)
			return
		}
		// Resolve machine_id from defects if missing
		if machineID == nil {
			var mID uuid.UUID
			if err := db.DB.QueryRowContext(r.Context(), `SELECT machine_id FROM defects WHERE id = $1`, req.DefectID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}
	case models.TimeEntryTypeIndirect:
		// Machine ID is optional for indirect/general shop time
	default:
		respondError(w, http.StatusBadRequest, fmt.Sprintf("Unsupported entry_type: %s", req.EntryType), nil)
		return
	}

	workDate := req.WorkDate
	if workDate == "" {
		workDate = time.Now().Format("2006-01-02")
	}

	insertQuery := `
		INSERT INTO time_entries (
			user_id, machine_id, entry_type, project_task_id, rework_item_id, defect_id,
			work_date, hours_spent, work_description, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING id, user_id, machine_id, entry_type, project_task_id, rework_item_id, defect_id,
		          work_date, hours_spent, work_description, created_at, updated_at
	`

	var entry models.TimeEntry
	var mID, taskID, rwID, defID uuid.NullUUID
	var wDate time.Time

	err = db.DB.QueryRowContext(r.Context(), insertQuery,
		userUUID, machineID, req.EntryType, req.ProjectTaskID, req.ReworkItemID, req.DefectID,
		workDate, req.HoursSpent, req.WorkDescription,
	).Scan(
		&entry.ID, &entry.UserID, &mID, &entry.EntryType, &taskID, &rwID, &defID,
		&wDate, &entry.HoursSpent, &entry.WorkDescription, &entry.CreatedAt, &entry.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to record time entry", err)
		return
	}

	entry.WorkDate = wDate.Format("2006-01-02")
	if mID.Valid {
		entry.MachineID = &mID.UUID
		_ = db.DB.QueryRowContext(r.Context(), `SELECT order_number FROM machines WHERE id = $1`, mID.UUID).Scan(&entry.OrderNumber)
	}
	if taskID.Valid {
		entry.ProjectTaskID = &taskID.UUID
		_ = db.DB.QueryRowContext(r.Context(), `SELECT task_name FROM project_tasks WHERE id = $1`, taskID.UUID).Scan(&entry.TaskName)
	}
	if rwID.Valid {
		entry.ReworkItemID = &rwID.UUID
		_ = db.DB.QueryRowContext(r.Context(), `SELECT part_number FROM rework_items WHERE id = $1`, rwID.UUID).Scan(&entry.ReworkPartNum)

		// Sync actual_hours into rework_items
		_, _ = db.DB.ExecContext(r.Context(), `
			UPDATE rework_items 
			SET actual_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE rework_item_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, rwID.UUID)
	}
	if defID.Valid {
		entry.DefectID = &defID.UUID
	}

	// Fetch user display name
	_ = db.DB.QueryRowContext(r.Context(), `SELECT username FROM users WHERE id = $1`, userUUID).Scan(&entry.UserName)

	BroadcastEvent("time_entry_created", entry)
	respondJSON(w, http.StatusCreated, entry)
}

// handleGetMyTimeEntries returns the authenticated user's time entries.
func handleGetMyTimeEntries(w http.ResponseWriter, r *http.Request) {
	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}
	userUUID, err := uuid.Parse(authUserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid user identity", err)
		return
	}

	// Default to last 14 days if not specified
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	query := `
		SELECT 
			te.id, te.user_id, u.username, te.machine_id, COALESCE(m.order_number, ''),
			te.entry_type, te.project_task_id, COALESCE(pt.task_name, ''),
			te.rework_item_id, COALESCE(rw.part_number, ''),
			te.defect_id,
			te.work_date, te.hours_spent, COALESCE(te.work_description, ''),
			te.created_at, te.updated_at
		FROM time_entries te
		JOIN users u ON te.user_id = u.id
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		WHERE te.user_id = $1
	`
	var args []interface{}
	args = append(args, userUUID)

	if startDate != "" {
		args = append(args, startDate)
		query += fmt.Sprintf(" AND te.work_date >= $%d", len(args))
	}
	if endDate != "" {
		args = append(args, endDate)
		query += fmt.Sprintf(" AND te.work_date <= $%d", len(args))
	}

	query += " ORDER BY te.work_date DESC, te.created_at DESC LIMIT 100"

	rows, err := db.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch user time entries", err)
		return
	}
	defer rows.Close()

	entries := make([]models.TimeEntry, 0)
	for rows.Next() {
		var e models.TimeEntry
		var mID, taskID, rwID, defID uuid.NullUUID
		var wDate time.Time

		err := rows.Scan(
			&e.ID, &e.UserID, &e.UserName, &mID, &e.OrderNumber,
			&e.EntryType, &taskID, &e.TaskName,
			&rwID, &e.ReworkPartNum,
			&defID,
			&wDate, &e.HoursSpent, &e.WorkDescription,
			&e.CreatedAt, &e.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning time entry", err)
			return
		}

		e.WorkDate = wDate.Format("2006-01-02")
		if mID.Valid {
			e.MachineID = &mID.UUID
		}
		if taskID.Valid {
			e.ProjectTaskID = &taskID.UUID
		}
		if rwID.Valid {
			e.ReworkItemID = &rwID.UUID
		}
		if defID.Valid {
			e.DefectID = &defID.UUID
		}

		entries = append(entries, e)
	}

	respondJSON(w, http.StatusOK, entries)
}

// handleDeleteTimeEntry deletes a time entry if owned by user or if caller is manager/admin.
func handleDeleteTimeEntry(w http.ResponseWriter, r *http.Request) {
	entryIDStr := r.PathValue("id")
	entryID, err := uuid.Parse(entryIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid time entry ID", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	// Fetch entry to verify ownership and check rework linkage
	var ownerID uuid.UUID
	var rwID uuid.NullUUID
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT user_id, rework_item_id FROM time_entries WHERE id = $1
	`, entryID).Scan(&ownerID, &rwID)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Time entry not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to find time entry", err)
		return
	}

	// Verify permissions
	user, ok := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if ok && user != nil && user.Role != nil {
		role := *user.Role
		if role == "admin" || role == "manager" {
			isAdminOrManager = true
		}
	}

	if ownerID.String() != authUserID && !isAdminOrManager {
		respondError(w, http.StatusForbidden, "Forbidden: You cannot delete another user's time entry", nil)
		return
	}

	_, err = db.DB.ExecContext(r.Context(), `DELETE FROM time_entries WHERE id = $1`, entryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete time entry", err)
		return
	}

	// Recalculate rework item hours if linked
	if rwID.Valid {
		_, _ = db.DB.ExecContext(r.Context(), `
			UPDATE rework_items 
			SET actual_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE rework_item_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, rwID.UUID)
	}

	BroadcastEvent("time_entry_deleted", map[string]string{"id": entryID.String()})
	respondJSON(w, http.StatusOK, map[string]string{"message": "Time entry deleted successfully"})
}

// handleGetMachineLaborSummary aggregates all labor hours across Production, Rework, and Issues.
func handleGetMachineLaborSummary(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var summary models.MachineLaborSummary
	summary.MachineID = machineID

	// Fetch machine info
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT order_number, model_type, status FROM machines WHERE id = $1
	`, machineID).Scan(&summary.OrderNumber, &summary.ModelType, &summary.Status)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Machine not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to fetch machine info", err)
		return
	}

	// Fetch Quoted Hours
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT COALESCE(SUM(quoted_hours), 0.00) FROM project_tasks WHERE machine_id = $1
	`, machineID).Scan(&summary.TotalQuotedHours)

	// Fetch Production Hours
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE machine_id = $1 AND entry_type = 'production'
	`, machineID).Scan(&summary.TotalProductionHours)

	// Fetch Rework Hours
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE machine_id = $1 AND entry_type = 'rework'
	`, machineID).Scan(&summary.TotalReworkHours)

	// Fetch Issue Fix Hours
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE machine_id = $1 AND entry_type = 'issue_fix'
	`, machineID).Scan(&summary.TotalIssueFixHours)

	summary.TotalActualHours = summary.TotalProductionHours + summary.TotalReworkHours + summary.TotalIssueFixHours
	summary.ProductionVariance = summary.TotalProductionHours - summary.TotalQuotedHours

	// Also fetch task details
	tasksQuery := `
		SELECT 
			pt.id, pt.machine_id, m.order_number, pt.task_code, pt.task_name, pt.department,
			pt.quoted_hours,
			COALESCE(SUM(te.hours_spent), 0.00) AS actual_hours,
			(COALESCE(SUM(te.hours_spent), 0.00) - pt.quoted_hours) AS variance,
			pt.status, pt.created_by, pt.created_at, pt.updated_at
		FROM project_tasks pt
		JOIN machines m ON pt.machine_id = m.id
		LEFT JOIN time_entries te ON te.project_task_id = pt.id AND te.entry_type = 'production'
		WHERE pt.machine_id = $1
		GROUP BY pt.id, m.order_number
		ORDER BY pt.created_at ASC
	`
	rows, err := db.DB.QueryContext(r.Context(), tasksQuery, machineID)
	if err == nil {
		defer rows.Close()
		tasks := make([]models.ProjectTask, 0)
		for rows.Next() {
			var t models.ProjectTask
			var orderNum string
			var createdBy uuid.NullUUID
			if scanErr := rows.Scan(
				&t.ID, &t.MachineID, &orderNum, &t.TaskCode, &t.TaskName, &t.Department,
				&t.QuotedHours, &t.ActualHours, &t.Variance, &t.Status, &createdBy,
				&t.CreatedAt, &t.UpdatedAt,
			); scanErr == nil {
				t.OrderNumber = orderNum
				if createdBy.Valid {
					t.CreatedBy = &createdBy.UUID
				}
				tasks = append(tasks, t)
			}
		}
		summary.Tasks = tasks
	}

	respondJSON(w, http.StatusOK, summary)
}

// handleGetQuotingReviewReport returns a high-level report comparing quoting vs actual across machines and models.
func handleGetQuotingReviewReport(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT 
			m.id, m.order_number, m.model_type, m.status,
			COALESCE(q.total_quoted, 0.00) as total_quoted,
			COALESCE(prod.total_prod, 0.00) as total_prod,
			COALESCE(rw.total_rw, 0.00) as total_rw,
			COALESCE(iss.total_iss, 0.00) as total_iss
		FROM machines m
		LEFT JOIN (
			SELECT machine_id, SUM(quoted_hours) as total_quoted
			FROM project_tasks GROUP BY machine_id
		) q ON q.machine_id = m.id
		LEFT JOIN (
			SELECT machine_id, SUM(hours_spent) as total_prod
			FROM time_entries WHERE entry_type = 'production' GROUP BY machine_id
		) prod ON prod.machine_id = m.id
		LEFT JOIN (
			SELECT machine_id, SUM(hours_spent) as total_rw
			FROM time_entries WHERE entry_type = 'rework' GROUP BY machine_id
		) rw ON rw.machine_id = m.id
		LEFT JOIN (
			SELECT machine_id, SUM(hours_spent) as total_iss
			FROM time_entries WHERE entry_type = 'issue_fix' GROUP BY machine_id
		) iss ON iss.machine_id = m.id
		ORDER BY m.created_at DESC
	`

	rows, err := db.DB.QueryContext(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to generate quoting review report", err)
		return
	}
	defer rows.Close()

	summaries := make([]models.MachineLaborSummary, 0)
	for rows.Next() {
		var s models.MachineLaborSummary
		err := rows.Scan(
			&s.MachineID, &s.OrderNumber, &s.ModelType, &s.Status,
			&s.TotalQuotedHours, &s.TotalProductionHours, &s.TotalReworkHours, &s.TotalIssueFixHours,
		)
		if err != nil {
			slog.Error("Error scanning quoting report row", "error", err)
			continue
		}
		s.TotalActualHours = s.TotalProductionHours + s.TotalReworkHours + s.TotalIssueFixHours
		s.ProductionVariance = s.TotalProductionHours - s.TotalQuotedHours
		summaries = append(summaries, s)
	}

	respondJSON(w, http.StatusOK, summaries)
}

// handleGetDepartmentTasks returns core catalog tasks, optionally filtered by department.
func handleGetDepartmentTasks(w http.ResponseWriter, r *http.Request) {
	dept := r.URL.Query().Get("department")
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	query := `
		SELECT id, department, task_code, task_name, default_quoted_hours, is_active, created_by, created_at, updated_at
		FROM department_tasks
		WHERE 1=1
	`
	var args []interface{}
	if dept != "" {
		args = append(args, dept)
		query += fmt.Sprintf(" AND department = $%d", len(args))
	}
	if !includeInactive {
		query += " AND is_active = TRUE"
	}
	query += " ORDER BY department ASC, task_name ASC"

	rows, err := db.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch department tasks", err)
		return
	}
	defer rows.Close()

	tasks := make([]models.DepartmentTask, 0)
	for rows.Next() {
		var t models.DepartmentTask
		var createdBy uuid.NullUUID
		err := rows.Scan(
			&t.ID, &t.Department, &t.TaskCode, &t.TaskName,
			&t.DefaultQuotedHours, &t.IsActive, &createdBy,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning department task", err)
			return
		}
		if createdBy.Valid {
			t.CreatedBy = &createdBy.UUID
		}
		tasks = append(tasks, t)
	}

	respondJSON(w, http.StatusOK, tasks)
}

// handleCreateDepartmentTask adds or reactivates a core department task in the catalog.
func handleCreateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	var req models.CreateDepartmentTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	if req.Department == "" || req.TaskCode == "" || req.TaskName == "" {
		respondError(w, http.StatusBadRequest, "department, task_code, and task_name are required", nil)
		return
	}
	if req.DefaultQuotedHours < 0 {
		respondError(w, http.StatusBadRequest, "default_quoted_hours cannot be negative", nil)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var creatorUUID *uuid.UUID
	if authUserID != "" {
		if uid, err := uuid.Parse(authUserID); err == nil {
			creatorUUID = &uid
		}
	}

	query := `
		INSERT INTO department_tasks (department, task_code, task_name, default_quoted_hours, is_active, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
		ON CONFLICT (department, task_code) DO UPDATE
		SET task_name = EXCLUDED.task_name,
		    default_quoted_hours = EXCLUDED.default_quoted_hours,
		    is_active = TRUE,
		    updated_at = NOW()
		RETURNING id, department, task_code, task_name, default_quoted_hours, is_active, created_by, created_at, updated_at
	`

	var t models.DepartmentTask
	var createdBy uuid.NullUUID
	err := db.DB.QueryRowContext(r.Context(), query,
		req.Department, req.TaskCode, req.TaskName, req.DefaultQuotedHours, creatorUUID,
	).Scan(
		&t.ID, &t.Department, &t.TaskCode, &t.TaskName,
		&t.DefaultQuotedHours, &t.IsActive, &createdBy,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create department task", err)
		return
	}
	if createdBy.Valid {
		t.CreatedBy = &createdBy.UUID
	}

	BroadcastEvent("department_task_created", t)
	respondJSON(w, http.StatusCreated, t)
}

// handleUpdateDepartmentTask updates a core task's name, default quote, or active state.
func handleUpdateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.PathValue("id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	var req models.UpdateDepartmentTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	if req.DefaultQuotedHours != nil && *req.DefaultQuotedHours < 0 {
		respondError(w, http.StatusBadRequest, "default_quoted_hours cannot be negative", nil)
		return
	}

	query := `
		UPDATE department_tasks
		SET 
			task_name = COALESCE($1, task_name),
			default_quoted_hours = COALESCE($2, default_quoted_hours),
			is_active = COALESCE($3, is_active),
			updated_at = NOW()
		WHERE id = $4
		RETURNING id, department, task_code, task_name, default_quoted_hours, is_active, created_by, created_at, updated_at
	`

	var t models.DepartmentTask
	var createdBy uuid.NullUUID
	err = db.DB.QueryRowContext(r.Context(), query, req.TaskName, req.DefaultQuotedHours, req.IsActive, taskID).Scan(
		&t.ID, &t.Department, &t.TaskCode, &t.TaskName,
		&t.DefaultQuotedHours, &t.IsActive, &createdBy,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Department task not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update department task", err)
		return
	}
	if createdBy.Valid {
		t.CreatedBy = &createdBy.UUID
	}

	BroadcastEvent("department_task_updated", t)
	respondJSON(w, http.StatusOK, t)
}

// handleDeleteDepartmentTask deactivates a task so it is retired from active rotation.
func handleDeleteDepartmentTask(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.PathValue("id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	query := `
		UPDATE department_tasks
		SET is_active = FALSE, updated_at = NOW()
		WHERE id = $1
		RETURNING id, department, task_code, task_name, default_quoted_hours, is_active, created_by, created_at, updated_at
	`

	var t models.DepartmentTask
	var createdBy uuid.NullUUID
	err = db.DB.QueryRowContext(r.Context(), query, taskID).Scan(
		&t.ID, &t.Department, &t.TaskCode, &t.TaskName,
		&t.DefaultQuotedHours, &t.IsActive, &createdBy,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Department task not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to deactivate department task", err)
		return
	}
	if createdBy.Valid {
		t.CreatedBy = &createdBy.UUID
	}

	BroadcastEvent("department_task_deleted", map[string]string{"id": taskID.String(), "department": t.Department})
	respondJSON(w, http.StatusOK, map[string]string{"message": "Department task deactivated successfully"})
}
