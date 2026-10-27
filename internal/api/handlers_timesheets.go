package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/domain/timesheets"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetMachineTasks returns all project tasks for a machine
func (s *Server) handleGetMachineTasks(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	tasks, err := s.Timesheets.GetMachineTasks(r.Context(), machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query tasks", err)
		return
	}

	respondJSON(w, http.StatusOK, tasks)
}

func handleGetMachineTasks(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMachineTasks(w, r)
}

// handleCreateProjectTask adds a task to a machine
func (s *Server) handleCreateProjectTask(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var req models.CreateProjectTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var createdBy *uuid.UUID
	if authUserID != "" {
		if u, err := uuid.Parse(authUserID); err == nil {
			createdBy = &u
		}
	}

	task, err := s.Timesheets.CreateProjectTask(r.Context(), machineID, req, createdBy)
	if err != nil {
		if errors.Is(err, timesheets.ErrTaskRequired) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create task", err)
		return
	}

	BroadcastEvent("project_task_created", task)
	respondJSON(w, http.StatusCreated, task)
}

func handleCreateProjectTask(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateProjectTask(w, r)
}

// handleUpdateTaskQuote updates quoted hours or status
func (s *Server) handleUpdateTaskQuote(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.PathValue("task_id")
	taskID, err := uuid.Parse(taskIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	var req models.UpdateTaskQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	task, err := s.Timesheets.UpdateTaskQuote(r.Context(), taskID, req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update task quote", err)
		return
	}

	BroadcastEvent("project_task_updated", task)
	respondJSON(w, http.StatusOK, task)
}

func handleUpdateTaskQuote(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleUpdateTaskQuote(w, r)
}

// handleCreateTimeEntry logs labor
func (s *Server) handleCreateTimeEntry(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTimeEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Authentication required", nil)
		return
	}
	userID, err := uuid.Parse(authUserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid user session", err)
		return
	}

	entry, err := s.Timesheets.CreateTimeEntry(r.Context(), userID, req)
	if err != nil {
		if errors.Is(err, timesheets.ErrInvalidHours) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to log time entry", err)
		return
	}

	BroadcastEvent("time_entry_created", entry)
	respondJSON(w, http.StatusCreated, entry)
}

func handleCreateTimeEntry(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateTimeEntry(w, r)
}

// handleGetMyTimeEntries returns labor history
func (s *Server) handleGetMyTimeEntries(w http.ResponseWriter, r *http.Request) {
	authUserID := getAuthenticatedUserID(r)
	var userID *uuid.UUID
	if authUserID != "" {
		if u, err := uuid.Parse(authUserID); err == nil {
			userID = &u
		}
	}

	var machineID *uuid.UUID
	if mIDStr := r.URL.Query().Get("machine_id"); mIDStr != "" {
		if u, err := uuid.Parse(mIDStr); err == nil {
			machineID = &u
		}
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	entries, err := s.Timesheets.GetTimeEntries(r.Context(), userID, machineID, startDate, endDate)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query time entries", err)
		return
	}

	respondJSON(w, http.StatusOK, entries)
}

func handleGetMyTimeEntries(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMyTimeEntries(w, r)
}

// handleDeleteTimeEntry removes a time entry
func (s *Server) handleDeleteTimeEntry(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid time entry ID", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Authentication required", nil)
		return
	}
	userID, _ := uuid.Parse(authUserID)

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		rRole := strings.ToLower(*user.Role)
		if rRole == "admin" || rRole == "manager" {
			isAdminOrManager = true
		}
	}

	if err := s.Timesheets.DeleteTimeEntry(r.Context(), id, userID, isAdminOrManager); err != nil {
		if errors.Is(err, timesheets.ErrForbidden) {
			respondError(w, http.StatusForbidden, "Forbidden", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete time entry", err)
		return
	}

	BroadcastEvent("time_entry_deleted", map[string]string{"id": id.String()})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func handleDeleteTimeEntry(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleDeleteTimeEntry(w, r)
}

// handleGetMachineLaborSummary aggregates hours for a machine
func (s *Server) handleGetMachineLaborSummary(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	summary, err := s.Timesheets.GetMachineLaborSummary(r.Context(), machineID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Machine not found", err)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to compute labor summary", err)
		return
	}

	respondJSON(w, http.StatusOK, summary)
}

func handleGetMachineLaborSummary(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMachineLaborSummary(w, r)
}

// handleGetQuotingReviewReport returns quoting variance across machines
func (s *Server) handleGetQuotingReviewReport(w http.ResponseWriter, r *http.Request) {
	report, err := s.Timesheets.GetQuotingReviewReport(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to build review report", err)
		return
	}
	respondJSON(w, http.StatusOK, report)
}

func handleGetQuotingReviewReport(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetQuotingReviewReport(w, r)
}

// handleGetMachineLaborCorrelation maps catalog tasks to logged labor
func (s *Server) handleGetMachineLaborCorrelation(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	rep, err := s.Timesheets.GetMachineLaborCorrelation(r.Context(), machineID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Machine not found", err)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to generate correlation report", err)
		return
	}

	respondJSON(w, http.StatusOK, rep)
}

func handleGetMachineLaborCorrelation(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMachineLaborCorrelation(w, r)
}

// handleGetDepartmentTasks returns department core tasks catalog
func (s *Server) handleGetDepartmentTasks(w http.ResponseWriter, r *http.Request) {
	dept := r.URL.Query().Get("department")
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	activeOnly := !includeInactive

	tasks, err := s.Timesheets.GetDepartmentTasks(r.Context(), dept, activeOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query department tasks", err)
		return
	}

	respondJSON(w, http.StatusOK, tasks)
}

func handleGetDepartmentTasks(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetDepartmentTasks(w, r)
}

// handleCreateDepartmentTask adds a task to the department catalog
func (s *Server) handleCreateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	var req models.CreateDepartmentTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)
	var createdBy *uuid.UUID
	if authUserID != "" {
		if u, err := uuid.Parse(authUserID); err == nil {
			createdBy = &u
		}
	}

	task, err := s.Timesheets.CreateDepartmentTask(r.Context(), req, createdBy)
	if err != nil {
		if errors.Is(err, timesheets.ErrDeptTaskRequired) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create department task", err)
		return
	}

	BroadcastEvent("department_task_created", task)
	respondJSON(w, http.StatusCreated, task)
}

func handleCreateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateDepartmentTask(w, r)
}

// handleUpdateDepartmentTask updates a catalog task
func (s *Server) handleUpdateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid department task ID", err)
		return
	}

	var req models.UpdateDepartmentTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload", err)
		return
	}

	task, err := s.Timesheets.UpdateDepartmentTask(r.Context(), id, req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update department task", err)
		return
	}

	BroadcastEvent("department_task_updated", task)
	respondJSON(w, http.StatusOK, task)
}

func handleUpdateDepartmentTask(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleUpdateDepartmentTask(w, r)
}

// handleDeleteDepartmentTask deactivates a catalog task
func (s *Server) handleDeleteDepartmentTask(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid department task ID", err)
		return
	}

	if err := s.Timesheets.DeleteDepartmentTask(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to deactivate task", err)
		return
	}

	BroadcastEvent("department_task_deleted", map[string]string{"id": id.String()})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deactivated"})
}

func handleDeleteDepartmentTask(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleDeleteDepartmentTask(w, r)
}

// handleGetWeeklyTimesheet fetches or initializes a weekly draft
func (s *Server) handleGetWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	authUserID := getAuthenticatedUserID(r)
	if authUserID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	targetUserIDStr := r.URL.Query().Get("user_id")
	targetUserID := authUserID
	if targetUserIDStr != "" {
		targetUserID = targetUserIDStr
	}

	userUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user_id", err)
		return
	}

	weekStart := r.URL.Query().Get("week_start")
	if weekStart == "" {
		respondError(w, http.StatusBadRequest, "week_start (YYYY-MM-DD) is required", nil)
		return
	}

	timesheet, err := s.Timesheets.GetOrCreateWeeklyTimesheet(r.Context(), userUUID, weekStart)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load timesheet", err)
		return
	}

	respondJSON(w, http.StatusOK, timesheet)
}

func handleGetWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetWeeklyTimesheet(w, r)
}

// handleSaveWeeklyTimesheet saves weekly time entries
func (s *Server) handleSaveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		roleStr := strings.ToLower(*user.Role)
		if roleStr == "admin" || roleStr == "manager" {
			isAdminOrManager = true
		}
	}

	saved, err := s.Timesheets.SaveWeeklyTimesheet(r.Context(), timesheetID, req, authUserID, isAdminOrManager)
	if err != nil {
		if errors.Is(err, timesheets.ErrTimesheetNotFound) {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		if errors.Is(err, timesheets.ErrForbidden) {
			respondError(w, http.StatusForbidden, err.Error(), nil)
			return
		}
		if errors.Is(err, timesheets.ErrAlreadyApproved) || errors.Is(err, timesheets.ErrInvalidHours) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		if strings.Contains(err.Error(), "Invalid work_date") || strings.Contains(err.Error(), "outside of timesheet week") {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to save timesheet", err)
		return
	}

	BroadcastEvent("timesheet_updated", saved)
	respondJSON(w, http.StatusOK, saved)
}

func handleSaveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleSaveWeeklyTimesheet(w, r)
}

// handleSubmitWeeklyTimesheet transitions draft -> submitted
func (s *Server) handleSubmitWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		roleStr := strings.ToLower(*user.Role)
		if roleStr == "admin" || roleStr == "manager" {
			isAdminOrManager = true
		}
	}

	submitted, err := s.Timesheets.SubmitWeeklyTimesheet(r.Context(), timesheetID, authUserUUID, authUserID, isAdminOrManager)
	if err != nil {
		if errors.Is(err, timesheets.ErrTimesheetNotFound) {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		if errors.Is(err, timesheets.ErrForbidden) {
			respondError(w, http.StatusForbidden, err.Error(), nil)
			return
		}
		if errors.Is(err, timesheets.ErrZeroHoursSubmit) || strings.Contains(err.Error(), "Cannot submit timesheet with status") {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to submit timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_submitted", submitted)
	respondJSON(w, http.StatusOK, submitted)
}

func handleSubmitWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleSubmitWeeklyTimesheet(w, r)
}

// handleWithdrawWeeklyTimesheet returns submitted timesheet back to draft
func (s *Server) handleWithdrawWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	isAdminOrManager := false
	if user != nil && user.Role != nil {
		roleStr := strings.ToLower(*user.Role)
		if roleStr == "admin" || roleStr == "manager" {
			isAdminOrManager = true
		}
	}

	withdrawn, err := s.Timesheets.WithdrawWeeklyTimesheet(r.Context(), timesheetID, authUserID, isAdminOrManager)
	if err != nil {
		if errors.Is(err, timesheets.ErrTimesheetNotFound) {
			respondError(w, http.StatusNotFound, "Weekly timesheet not found", nil)
			return
		}
		if errors.Is(err, timesheets.ErrForbidden) {
			respondError(w, http.StatusForbidden, err.Error(), nil)
			return
		}
		if strings.Contains(err.Error(), "Cannot withdraw timesheet with status") {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to withdraw timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_withdrawn", withdrawn)
	respondJSON(w, http.StatusOK, withdrawn)
}

func handleWithdrawWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleWithdrawWeeklyTimesheet(w, r)
}

// handleGetTimesheetApprovals lists timesheets for manager review
func (s *Server) handleGetTimesheetApprovals(w http.ResponseWriter, r *http.Request) {
	deptFilter := r.URL.Query().Get("department")
	statusFilter := r.URL.Query().Get("status")
	weekStartFilter := r.URL.Query().Get("week_start")

	user, _ := r.Context().Value(UserContextKey).(*models.User)
	if user != nil && user.Role != nil && strings.ToLower(*user.Role) == "lead" && deptFilter == "" && user.Department != nil {
		deptFilter = *user.Department
	}

	list, err := s.Timesheets.GetTimesheetApprovals(r.Context(), deptFilter, statusFilter, weekStartFilter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query approvals", err)
		return
	}

	respondJSON(w, http.StatusOK, list)
}

func handleGetTimesheetApprovals(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetTimesheetApprovals(w, r)
}

// handleApproveWeeklyTimesheet records manager approval
func (s *Server) handleApproveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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
	approverID, _ := uuid.Parse(authUserID)

	approved, err := s.Timesheets.ApproveWeeklyTimesheet(r.Context(), timesheetID, approverID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to approve timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_approved", approved)
	respondJSON(w, http.StatusOK, approved)
}

func handleApproveWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleApproveWeeklyTimesheet(w, r)
}

// handleRejectWeeklyTimesheet records manager rejection
func (s *Server) handleRejectWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
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

	rejected, err := s.Timesheets.RejectWeeklyTimesheet(r.Context(), timesheetID, req.Reason)
	if err != nil {
		if errors.Is(err, timesheets.ErrRejectReasonEmpty) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to reject timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_rejected", rejected)
	respondJSON(w, http.StatusOK, rejected)
}

func handleRejectWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleRejectWeeklyTimesheet(w, r)
}

// handleDeleteWeeklyTimesheet removes a timesheet
func (s *Server) handleDeleteWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	timesheetID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid timesheet ID", err)
		return
	}

	if err := s.Timesheets.DeleteWeeklyTimesheet(r.Context(), timesheetID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete weekly timesheet", err)
		return
	}

	BroadcastEvent("weekly_timesheet_deleted", map[string]string{"id": timesheetID.String()})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func handleDeleteWeeklyTimesheet(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleDeleteWeeklyTimesheet(w, r)
}
