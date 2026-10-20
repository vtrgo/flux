package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
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
		var taskID uuid.NullUUID
		err := rows.Scan(
			&t.ID, &t.MachineID, &orderNum, &taskID, &t.TaskCode, &t.TaskName, &t.Department,
			&t.QuotedHours, &t.ActualHours, &t.Variance, &t.Status, &createdBy,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning machine task", err)
			return
		}
		t.OrderNumber = orderNum
		if taskID.Valid {
			t.TaskID = &taskID.UUID
		}
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

	var taskUUID *uuid.UUID = req.TaskID
	if taskUUID == nil {
		var resolvedID uuid.UUID
		if err := db.DB.QueryRowContext(r.Context(), `
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
	var createdBy uuid.NullUUID
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

	err = db.DB.QueryRowContext(r.Context(), upsertQuery,
		machineID, taskUUID, req.TaskCode, req.TaskName, req.Department, req.QuotedHours, creatorUUID,
	).Scan(
		&task.ID, &task.MachineID, &scannedTaskID, &task.TaskCode, &task.TaskName, &task.Department,
		&task.QuotedHours, &task.Status, &createdBy, &task.CreatedAt, &task.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create or update project task", err)
		return
	}

	if scannedTaskID.Valid {
		task.TaskID = &scannedTaskID.UUID
	}
	if createdBy.Valid {
		task.CreatedBy = &createdBy.UUID
	}

	// Fetch actual hours & order number
	_ = db.DB.QueryRowContext(r.Context(), `
		SELECT m.order_number, COALESCE(SUM(te.hours_spent), 0.00)
		FROM machines m
		LEFT JOIN time_entries te ON (te.project_task_id = $1 OR (te.machine_id = $2 AND te.task_id IS NOT NULL AND te.task_id = $3)) AND te.entry_type = 'production'
		WHERE m.id = $2
		GROUP BY m.order_number
	`, task.ID, task.MachineID, taskUUID).Scan(&task.OrderNumber, &task.ActualHours)
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
		if req.ProjectTaskID == nil && req.TaskID == nil && strings.TrimSpace(req.WorkDescription) == "" {
			respondError(w, http.StatusBadRequest, "task or project_task_id is required for production time entries", nil)
			return
		}
		// Resolve machine_id from project_task if missing
		if machineID == nil && req.ProjectTaskID != nil {
			var mID uuid.UUID
			if err := db.DB.QueryRowContext(r.Context(), `SELECT machine_id FROM project_tasks WHERE id = $1`, req.ProjectTaskID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}
		if machineID == nil {
			respondError(w, http.StatusBadRequest, "machine_id is required for production time entries", nil)
			return
		}
		// Try to resolve project_task_id if missing
		if req.ProjectTaskID == nil {
			var ptID uuid.UUID
			if req.TaskID != nil {
				if err := db.DB.QueryRowContext(r.Context(), `
					SELECT id FROM project_tasks WHERE machine_id = $1 AND task_id = $2 LIMIT 1
				`, *machineID, *req.TaskID).Scan(&ptID); err == nil {
					req.ProjectTaskID = &ptID
				}
			}
			if req.ProjectTaskID == nil && req.WorkDescription != "" {
				if err := db.DB.QueryRowContext(r.Context(), `
					SELECT id FROM project_tasks WHERE machine_id = $1 AND (task_name = $2 OR task_code = $2) LIMIT 1
				`, *machineID, req.WorkDescription).Scan(&ptID); err == nil {
					req.ProjectTaskID = &ptID
				}
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

	// Ensure weekly timesheet exists and link
	var weeklyTimesheetID uuid.UUID
	_ = db.DB.QueryRowContext(r.Context(), `
		INSERT INTO weekly_timesheets (user_id, week_start_date, status, total_hours, created_at, updated_at)
		VALUES ($1, ($2::date - EXTRACT(DOW FROM $2::date)::integer * INTERVAL '1 day')::date, 'draft', 0.00, NOW(), NOW())
		ON CONFLICT (user_id, week_start_date) DO UPDATE
		SET updated_at = weekly_timesheets.updated_at
		RETURNING id
	`, userUUID, workDate).Scan(&weeklyTimesheetID)

	var authorTaskID *uuid.UUID = req.TaskID
	if authorTaskID == nil && req.ProjectTaskID != nil {
		var resolvedTaskID uuid.NullUUID
		_ = db.DB.QueryRowContext(r.Context(), `SELECT task_id FROM project_tasks WHERE id = $1`, req.ProjectTaskID).Scan(&resolvedTaskID)
		if resolvedTaskID.Valid {
			authorTaskID = &resolvedTaskID.UUID
		}
	}
	if authorTaskID == nil && req.WorkDescription != "" {
		var resolvedTaskID uuid.UUID
		if err := db.DB.QueryRowContext(r.Context(), `
			SELECT id FROM department_tasks WHERE (task_name = $1 OR task_code = $1) ORDER BY is_active DESC LIMIT 1
		`, req.WorkDescription).Scan(&resolvedTaskID); err == nil {
			authorTaskID = &resolvedTaskID
		}
	}

	insertQuery := `
		INSERT INTO time_entries (
			user_id, weekly_timesheet_id, machine_id, entry_type, project_task_id, task_id, rework_item_id, defect_id,
			work_date, hours_spent, work_description, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, user_id, weekly_timesheet_id, machine_id, entry_type, project_task_id, task_id, rework_item_id, defect_id,
		          work_date, hours_spent, work_description, created_at, updated_at
	`

	var entry models.TimeEntry
	var mID, taskID, aTaskID, rwID, defID, wtID uuid.NullUUID
	var wDate time.Time

	var wtIDParam *uuid.UUID
	if weeklyTimesheetID != uuid.Nil {
		wtIDParam = &weeklyTimesheetID
	}

	err = db.DB.QueryRowContext(r.Context(), insertQuery,
		userUUID, wtIDParam, machineID, req.EntryType, req.ProjectTaskID, authorTaskID, req.ReworkItemID, req.DefectID,
		workDate, req.HoursSpent, req.WorkDescription,
	).Scan(
		&entry.ID, &entry.UserID, &wtID, &mID, &entry.EntryType, &taskID, &aTaskID, &rwID, &defID,
		&wDate, &entry.HoursSpent, &entry.WorkDescription, &entry.CreatedAt, &entry.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to record time entry", err)
		return
	}

	entry.WorkDate = wDate.Format("2006-01-02")
	if wtID.Valid {
		entry.WeeklyTimesheetID = &wtID.UUID
	}
	if aTaskID.Valid {
		entry.TaskID = &aTaskID.UUID
	}
	if weeklyTimesheetID != uuid.Nil {
		_, _ = db.DB.ExecContext(r.Context(), `
			UPDATE weekly_timesheets
			SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, weeklyTimesheetID)
	}

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
			te.entry_type, te.project_task_id, te.task_id,
			COALESCE(dt.task_name, pt.task_name, te.work_description, ''),
			COALESCE(dt.department, pt.department, ''),
			te.rework_item_id, COALESCE(rw.part_number, ''),
			te.defect_id,
			te.work_date, te.hours_spent, COALESCE(te.work_description, ''),
			te.created_at, te.updated_at
		FROM time_entries te
		JOIN users u ON te.user_id = u.id
		LEFT JOIN machines m ON te.machine_id = m.id
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
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
		var mID, taskID, aTaskID, rwID, defID uuid.NullUUID
		var wDate time.Time

		err := rows.Scan(
			&e.ID, &e.UserID, &e.UserName, &mID, &e.OrderNumber,
			&e.EntryType, &taskID, &aTaskID, &e.TaskName,
			&e.Department,
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
		if aTaskID.Valid {
			e.TaskID = &aTaskID.UUID
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

	// Fetch entry to verify ownership and check rework / weekly timesheet linkage
	var ownerID uuid.UUID
	var rwID, wtID uuid.NullUUID
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT user_id, rework_item_id, weekly_timesheet_id FROM time_entries WHERE id = $1
	`, entryID).Scan(&ownerID, &rwID, &wtID)
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

	// Recalculate weekly timesheet total hours if linked
	if wtID.Valid {
		_, _ = db.DB.ExecContext(r.Context(), `
			UPDATE weekly_timesheets
			SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, wtID.UUID)
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

// handleGetMachineLaborCorrelation returns a unified correlation report linking assigned vs consumed hours per authoritative task.
func handleGetMachineLaborCorrelation(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var report models.MachineLaborCorrelationReport
	report.MachineID = machineID
	report.Tasks = make([]models.LaborCorrelationItem, 0)
	report.DepartmentBreakdown = make(map[string]models.DepartmentRollup)

	// Fetch machine info
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT order_number, model_type, status FROM machines WHERE id = $1
	`, machineID).Scan(&report.OrderNumber, &report.ModelType, &report.Status)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Machine not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to fetch machine info", err)
		return
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

	rows, err := db.DB.QueryContext(r.Context(), correlationQuery, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to run labor correlation", err)
		return
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
			respondError(w, http.StatusInternalServerError, "Failed to scan correlation item", err)
			return
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

		// Department rollup
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

	respondJSON(w, http.StatusOK, report)
}

// handleGetDepartmentTasks returns core catalog tasks, optionally filtered by department.
func handleGetDepartmentTasks(w http.ResponseWriter, r *http.Request) {
	dept := r.URL.Query().Get("department")
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	if search == "" {
		search = strings.TrimSpace(r.URL.Query().Get("q"))
	}

	query := `
		SELECT id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
		FROM department_tasks
		WHERE 1=1
	`
	var args []interface{}
	if dept != "" {
		args = append(args, dept)
		query += fmt.Sprintf(" AND (department = $%d OR (LOWER(department) IN ('controls', 'electrical-controls', 'electrical_controls') AND LOWER($%d) IN ('controls', 'electrical-controls', 'electrical_controls')))", len(args), len(args))
	}
	if search != "" {
		args = append(args, "%"+search+"%")
		query += fmt.Sprintf(" AND (task_name ILIKE $%d OR task_code ILIKE $%d OR description ILIKE $%d)", len(args), len(args), len(args))
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
		var desc sql.NullString
		var createdBy uuid.NullUUID
		err := rows.Scan(
			&t.ID, &t.Department, &t.TaskCode, &t.TaskName, &desc,
			&t.DefaultQuotedHours, &t.IsActive, &createdBy,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning department task", err)
			return
		}
		if desc.Valid {
			t.Description = &desc.String
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
		INSERT INTO department_tasks (department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
		ON CONFLICT (department, task_code) DO UPDATE
		SET task_name = EXCLUDED.task_name,
		    description = COALESCE(EXCLUDED.description, department_tasks.description),
		    default_quoted_hours = EXCLUDED.default_quoted_hours,
		    is_active = TRUE,
		    updated_at = NOW()
		RETURNING id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
	`

	var t models.DepartmentTask
	var desc sql.NullString
	var createdBy uuid.NullUUID
	err := db.DB.QueryRowContext(r.Context(), query,
		req.Department, req.TaskCode, req.TaskName, req.Description, req.DefaultQuotedHours, creatorUUID,
	).Scan(
		&t.ID, &t.Department, &t.TaskCode, &t.TaskName, &desc,
		&t.DefaultQuotedHours, &t.IsActive, &createdBy,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create department task", err)
		return
	}
	if desc.Valid {
		t.Description = &desc.String
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
			department = COALESCE($1, department),
			task_code = COALESCE($2, task_code),
			task_name = COALESCE($3, task_name),
			description = COALESCE($4, description),
			default_quoted_hours = COALESCE($5, default_quoted_hours),
			is_active = COALESCE($6, is_active),
			updated_at = NOW()
		WHERE id = $7
		RETURNING id, department, task_code, task_name, description, default_quoted_hours, is_active, created_by, created_at, updated_at
	`

	var t models.DepartmentTask
	var desc sql.NullString
	var createdBy uuid.NullUUID
	err = db.DB.QueryRowContext(r.Context(), query,
		req.Department, req.TaskCode, req.TaskName, req.Description, req.DefaultQuotedHours, req.IsActive, taskID,
	).Scan(
		&t.ID, &t.Department, &t.TaskCode, &t.TaskName, &desc,
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
	if desc.Valid {
		t.Description = &desc.String
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

// fetchWeeklyTimesheet retrieves a weekly timesheet along with all linked time entries.
func fetchWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) (*models.WeeklyTimesheet, error) {
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
	err := db.DB.QueryRowContext(ctx, query, timesheetID).Scan(
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
		LEFT JOIN project_tasks pt ON te.project_task_id = pt.id
		LEFT JOIN department_tasks dt ON te.task_id = dt.id
		LEFT JOIN rework_items rw ON te.rework_item_id = rw.id
		WHERE te.weekly_timesheet_id = $1
		ORDER BY te.work_date ASC, te.created_at ASC
	`
	rows, err := db.DB.QueryContext(ctx, entriesQuery, timesheetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	wt.Entries = make([]models.TimeEntry, 0)
	for rows.Next() {
		var e models.TimeEntry
		var wtID, mID, taskID, aTaskID, rwID, defID uuid.NullUUID
		err := rows.Scan(
			&e.ID, &e.UserID, &e.UserName, &wtID, &mID, &e.OrderNumber,
			&e.EntryType, &taskID, &aTaskID, &e.TaskName,
			&e.Department,
			&rwID, &e.ReworkPartNum,
			&defID,
			&e.WorkDate, &e.HoursSpent, &e.WorkDescription,
			&e.CreatedAt, &e.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if wtID.Valid {
			e.WeeklyTimesheetID = &wtID.UUID
		}
		if mID.Valid {
			e.MachineID = &mID.UUID
		}
		if taskID.Valid {
			e.ProjectTaskID = &taskID.UUID
		}
		if aTaskID.Valid {
			e.TaskID = &aTaskID.UUID
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

// handleGetWeeklyTimesheet fetches or initialises the authenticated user's weekly timesheet.
func handleGetWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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

	targetUserID := userUUID
	targetUserParam := r.URL.Query().Get("user_id")
	if targetUserParam != "" {
		if parsedTarget, err := uuid.Parse(targetUserParam); err == nil && parsedTarget != userUUID {
			user, ok := r.Context().Value(UserContextKey).(*models.User)
			if !ok || user == nil || user.Role == nil {
				respondError(w, http.StatusForbidden, "Forbidden", nil)
				return
			}
			role := strings.ToLower(*user.Role)
			if role != "admin" && role != "manager" && role != "lead" {
				respondError(w, http.StatusForbidden, "Forbidden: Only leads and managers can view other workers' timesheets", nil)
				return
			}
			targetUserID = parsedTarget
		}
	}

	weekStartParam := r.URL.Query().Get("week_start")
	var weekStartDate string
	if weekStartParam != "" {
		if err := db.DB.QueryRowContext(r.Context(), `SELECT to_char(($1::date - EXTRACT(DOW FROM $1::date)::integer * INTERVAL '1 day')::date, 'YYYY-MM-DD')`, weekStartParam).Scan(&weekStartDate); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid week_start date format (expected YYYY-MM-DD)", err)
			return
		}
	} else {
		if err := db.DB.QueryRowContext(r.Context(), `SELECT to_char((CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer * INTERVAL '1 day')::date, 'YYYY-MM-DD')`).Scan(&weekStartDate); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to determine current week", err)
			return
		}
	}

	// Ensure weekly_timesheets record exists (upsert draft)
	var timesheetID uuid.UUID
	upsertQuery := `
		INSERT INTO weekly_timesheets (user_id, week_start_date, status, total_hours, created_at, updated_at)
		VALUES ($1, $2::date, 'draft', 0.00, NOW(), NOW())
		ON CONFLICT (user_id, week_start_date) DO UPDATE
		SET updated_at = weekly_timesheets.updated_at
		RETURNING id
	`
	if err := db.DB.QueryRowContext(r.Context(), upsertQuery, targetUserID, weekStartDate).Scan(&timesheetID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load weekly timesheet", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch weekly timesheet details", err)
		return
	}

	respondJSON(w, http.StatusOK, wt)
}

// handleSaveWeeklyTimesheet saves entries and notes for a draft/rejected weekly timesheet.
func handleSaveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	var req models.WeeklyTimesheetSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	var ownerID uuid.UUID
	var status string
	var weekStartDate time.Time
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT user_id, status, week_start_date FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status, &weekStartDate)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to query timesheet", err)
		return
	}

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		r := strings.ToLower(*user.Role)
		if r == "admin" || r == "manager" {
			isAdminOrManager = true
		}
	}
	if ownerID.String() != authUserID && !isAdminOrManager {
		respondError(w, http.StatusForbidden, "Forbidden: You cannot modify another user's timesheet", nil)
		return
	}

	if status == string(models.WeeklyTimesheetStatusApproved) {
		respondError(w, http.StatusBadRequest, "Cannot modify timesheet: it has already been approved and locked into payroll ledger.", nil)
		return
	}

	weekEnd := weekStartDate.AddDate(0, 0, 7)
	for _, entry := range req.Entries {
		if entry.HoursSpent <= 0 || entry.HoursSpent > 24 {
			respondError(w, http.StatusBadRequest, "Each entry hours_spent must be greater than 0 and at most 24", nil)
			return
		}
		wDate, err := time.Parse("2006-01-02", entry.WorkDate)
		if err != nil {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("Invalid work_date format: %s", entry.WorkDate), err)
			return
		}
		if wDate.Before(weekStartDate) || !wDate.Before(weekEnd) {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("work_date %s is outside of timesheet week [%s to %s]", entry.WorkDate, weekStartDate.Format("2006-01-02"), weekStartDate.AddDate(0, 0, 6).Format("2006-01-02")), nil)
			return
		}
	}

	tx, err := db.DB.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to begin transaction", err)
		return
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if req.Notes != nil {
		if _, err := tx.ExecContext(r.Context(), `UPDATE weekly_timesheets SET notes = $1, updated_at = NOW() WHERE id = $2`, *req.Notes, timesheetID); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to update timesheet notes", err)
			return
		}
	}

	existingRows, err := tx.QueryContext(r.Context(), `SELECT id FROM time_entries WHERE weekly_timesheet_id = $1`, timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query existing entries", err)
		return
	}
	defer existingRows.Close()
	existingIDs := make(map[uuid.UUID]bool)
	for existingRows.Next() {
		var eid uuid.UUID
		if err := existingRows.Scan(&eid); err == nil {
			existingIDs[eid] = true
		}
	}

	keptIDs := make(map[uuid.UUID]bool)

	for _, item := range req.Entries {
		entryType := item.EntryType
		if entryType == "" {
			entryType = models.TimeEntryTypeProduction
		}

		machineID := item.MachineID
		if machineID == nil && item.ProjectTaskID != nil {
			var mID uuid.UUID
			if err := tx.QueryRowContext(r.Context(), `SELECT machine_id FROM project_tasks WHERE id = $1`, item.ProjectTaskID).Scan(&mID); err == nil {
				machineID = &mID
			}
		}

		authorTaskID := item.TaskID
		if authorTaskID == nil && item.ProjectTaskID != nil {
			var ptTaskID uuid.NullUUID
			_ = tx.QueryRowContext(r.Context(), `SELECT task_id FROM project_tasks WHERE id = $1`, item.ProjectTaskID).Scan(&ptTaskID)
			if ptTaskID.Valid {
				authorTaskID = &ptTaskID.UUID
			}
		}

		if authorTaskID == nil && item.WorkDescription != "" {
			var dtID uuid.UUID
			if err := tx.QueryRowContext(r.Context(), `
				SELECT id FROM department_tasks
				WHERE (task_name = $1 OR task_code = $1)
				ORDER BY is_active DESC, created_at DESC
				LIMIT 1
			`, item.WorkDescription).Scan(&dtID); err == nil {
				authorTaskID = &dtID
			}
		}

		// Resolve project_task_id from machine if missing
		if item.ProjectTaskID == nil && machineID != nil {
			var ptID uuid.UUID
			if authorTaskID != nil {
				if err := tx.QueryRowContext(r.Context(), `
					SELECT id FROM project_tasks
					WHERE machine_id = $1 AND task_id = $2
					LIMIT 1
				`, *machineID, *authorTaskID).Scan(&ptID); err == nil {
					item.ProjectTaskID = &ptID
				}
			}
			if item.ProjectTaskID == nil && item.WorkDescription != "" {
				if err := tx.QueryRowContext(r.Context(), `
					SELECT id FROM project_tasks
					WHERE machine_id = $1 AND (task_name = $2 OR task_code = $2)
					LIMIT 1
				`, *machineID, item.WorkDescription).Scan(&ptID); err == nil {
					item.ProjectTaskID = &ptID
				}
			}
		}

		if item.ID != nil && existingIDs[*item.ID] {
			_, err = tx.ExecContext(r.Context(), `
				UPDATE time_entries
				SET machine_id = $1, entry_type = $2, project_task_id = $3, task_id = $4,
				    work_date = $5::date, hours_spent = $6, work_description = $7, updated_at = NOW()
				WHERE id = $8 AND weekly_timesheet_id = $9
			`, machineID, entryType, item.ProjectTaskID, authorTaskID, item.WorkDate, item.HoursSpent, item.WorkDescription, *item.ID, timesheetID)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "Failed to update entry", err)
				return
			}
			keptIDs[*item.ID] = true
		} else {
			var newID uuid.UUID
			err = tx.QueryRowContext(r.Context(), `
				INSERT INTO time_entries (
					user_id, weekly_timesheet_id, machine_id, entry_type, project_task_id, task_id,
					work_date, hours_spent, work_description, created_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, NOW(), NOW())
				RETURNING id
			`, ownerID, timesheetID, machineID, entryType, item.ProjectTaskID, authorTaskID, item.WorkDate, item.HoursSpent, item.WorkDescription).Scan(&newID)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "Failed to insert entry", err)
				return
			}
			keptIDs[newID] = true
		}
	}

	for eid := range existingIDs {
		if !keptIDs[eid] {
			if _, err := tx.ExecContext(r.Context(), `DELETE FROM time_entries WHERE id = $1 AND weekly_timesheet_id = $2`, eid, timesheetID); err != nil {
				respondError(w, http.StatusInternalServerError, "Failed to delete removed entry", err)
				return
			}
		}
	}

	_, err = tx.ExecContext(r.Context(), `
		UPDATE weekly_timesheets
		SET total_hours = (SELECT COALESCE(SUM(hours_spent), 0.00) FROM time_entries WHERE weekly_timesheet_id = $1),
		    status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
		    rejection_reason = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_reason END,
		    updated_at = NOW()
		WHERE id = $1
	`, timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to recalculate timesheet total hours", err)
		return
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to commit timesheet updates", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch updated timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_updated", wt)
	respondJSON(w, http.StatusOK, wt)
}

// handleSubmitWeeklyTimesheet transitions a timesheet from draft/rejected to submitted.
func handleSubmitWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}
	authUserUUID, _ := uuid.Parse(authUserID)

	var ownerID uuid.UUID
	var status string
	var totalHours float64
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT user_id, status, total_hours FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status, &totalHours)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to query timesheet", err)
		return
	}

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		r := strings.ToLower(*user.Role)
		if r == "admin" || r == "manager" {
			isAdminOrManager = true
		}
	}
	if ownerID.String() != authUserID && !isAdminOrManager {
		respondError(w, http.StatusForbidden, "Forbidden: You cannot submit another user's timesheet", nil)
		return
	}

	if status != string(models.WeeklyTimesheetStatusDraft) && status != string(models.WeeklyTimesheetStatusRejected) {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("Cannot submit timesheet with status '%s'", status), nil)
		return
	}

	if totalHours <= 0 {
		respondError(w, http.StatusBadRequest, "Cannot submit timesheet with 0 hours logged", nil)
		return
	}

	_, err = db.DB.ExecContext(r.Context(), `
		UPDATE weekly_timesheets
		SET status = 'submitted', submitted_at = NOW(), submitted_by = $1, rejection_reason = NULL, updated_at = NOW()
		WHERE id = $2
	`, authUserUUID, timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to submit timesheet", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch submitted timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_submitted", wt)
	respondJSON(w, http.StatusOK, wt)
}

// handleWithdrawWeeklyTimesheet returns a submitted timesheet back to draft.
func handleWithdrawWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	var ownerID uuid.UUID
	var status string
	err = db.DB.QueryRowContext(r.Context(), `
		SELECT user_id, status FROM weekly_timesheets WHERE id = $1
	`, timesheetID).Scan(&ownerID, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to query timesheet", err)
		return
	}

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		r := strings.ToLower(*user.Role)
		if r == "admin" || r == "manager" {
			isAdminOrManager = true
		}
	}
	if ownerID.String() != authUserID && !isAdminOrManager {
		respondError(w, http.StatusForbidden, "Forbidden: You cannot withdraw another user's timesheet", nil)
		return
	}

	if status != string(models.WeeklyTimesheetStatusSubmitted) {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("Cannot withdraw timesheet with status '%s'. Only 'submitted' timesheets can be withdrawn.", status), nil)
		return
	}

	_, err = db.DB.ExecContext(r.Context(), `
		UPDATE weekly_timesheets
		SET status = 'draft', submitted_at = NULL, submitted_by = NULL, updated_at = NOW()
		WHERE id = $1
	`, timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to withdraw timesheet", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch withdrawn timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_withdrawn", wt)
	respondJSON(w, http.StatusOK, wt)
}

// handleGetTimesheetApprovals allows leads, managers, and admins to list timesheets for review.
func handleGetTimesheetApprovals(w http.ResponseWriter, r *http.Request) {
	deptFilter := r.URL.Query().Get("department")
	statusFilter := r.URL.Query().Get("status")
	weekStartFilter := r.URL.Query().Get("week_start")

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	if user != nil && user.Role != nil && strings.ToLower(*user.Role) == "lead" && deptFilter == "" && user.Department != nil {
		deptFilter = *user.Department
	}

	query := `
		SELECT 
			wt.id, wt.user_id, u.username, COALESCE(u.email, ''), COALESCE(u.department, ''),
			to_char(wt.week_start_date, 'YYYY-MM-DD') as week_start_date,
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

	if deptFilter != "" {
		query += fmt.Sprintf(" AND u.department = $%d", argIdx)
		args = append(args, deptFilter)
		argIdx++
	}
	if statusFilter == "pending" {
		query += " AND wt.status NOT IN ('approved', 'rejected') AND wt.total_hours > 0"
	} else if statusFilter != "" {
		query += fmt.Sprintf(" AND wt.status = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if weekStartFilter != "" {
		query += fmt.Sprintf(" AND wt.week_start_date = $%d::date", argIdx)
		args = append(args, weekStartFilter)
	}

	query += " ORDER BY wt.week_start_date DESC, u.username ASC"

	rows, err := db.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch timesheet approvals", err)
		return
	}
	defer rows.Close()

	list := make([]models.WeeklyTimesheet, 0)
	for rows.Next() {
		var wt models.WeeklyTimesheet
		var submittedBy, approvedBy uuid.NullUUID
		err := rows.Scan(
			&wt.ID, &wt.UserID, &wt.UserName, &wt.UserEmail, &wt.Department,
			&wt.WeekStartDate,
			&wt.Status, &wt.TotalHours, &wt.Notes,
			&wt.SubmittedAt, &submittedBy,
			&wt.ApprovedAt, &approvedBy, &wt.ApproverName,
			&wt.RejectionReason,
			&wt.CreatedAt, &wt.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning timesheet approval", err)
			return
		}
		if submittedBy.Valid {
			wt.SubmittedBy = &submittedBy.UUID
		}
		if approvedBy.Valid {
			wt.ApprovedBy = &approvedBy.UUID
		}
		list = append(list, wt)
	}

	respondJSON(w, http.StatusOK, list)
}

// handleApproveWeeklyTimesheet records lead/manager approval for a submitted timesheet.
func handleApproveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}
	authUserUUID, _ := uuid.Parse(authUserID)

	var status string
	var totalHours float64
	err = db.DB.QueryRowContext(r.Context(), `SELECT status, total_hours FROM weekly_timesheets WHERE id = $1`, timesheetID).Scan(&status, &totalHours)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to query timesheet", err)
		return
	}

	if status == string(models.WeeklyTimesheetStatusApproved) {
		respondError(w, http.StatusBadRequest, "Timesheet is already approved", nil)
		return
	}
	if totalHours <= 0 {
		respondError(w, http.StatusBadRequest, "Cannot approve timesheet with 0 hours logged", nil)
		return
	}

	_, err = db.DB.ExecContext(r.Context(), `
		UPDATE weekly_timesheets
		SET status = 'approved', approved_at = NOW(), approved_by = $1, rejection_reason = NULL, updated_at = NOW()
		WHERE id = $2
	`, authUserUUID, timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to approve timesheet", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch approved timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_approved", wt)
	respondJSON(w, http.StatusOK, wt)
}

// handleRejectWeeklyTimesheet records lead/manager rejection with a mandatory reason.
func handleRejectWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	var req models.RejectTimesheetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		respondError(w, http.StatusBadRequest, "A rejection reason is required", nil)
		return
	}

	var status string
	var totalHours float64
	err = db.DB.QueryRowContext(r.Context(), `SELECT status, total_hours FROM weekly_timesheets WHERE id = $1`, timesheetID).Scan(&status, &totalHours)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to query timesheet", err)
		return
	}

	if totalHours <= 0 {
		respondError(w, http.StatusBadRequest, "Cannot reject timesheet with 0 hours logged", nil)
		return
	}

	_, err = db.DB.ExecContext(r.Context(), `
		UPDATE weekly_timesheets
		SET status = 'rejected', rejection_reason = $1, approved_at = NULL, approved_by = NULL, updated_at = NOW()
		WHERE id = $2
	`, strings.TrimSpace(req.Reason), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to reject timesheet", err)
		return
	}

	wt, err := fetchWeeklyTimesheet(r.Context(), timesheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch rejected timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_rejected", wt)
	respondJSON(w, http.StatusOK, wt)
}

