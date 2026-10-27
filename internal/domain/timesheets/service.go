package timesheets

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrTaskRequired       = errors.New("task_code, task_name, and department are required")
	ErrDeptTaskRequired   = errors.New("department, task_code, and task_name are required")
	ErrRejectReasonEmpty  = errors.New("Rejection reason is required")
)

// Service defines domain operations for labor tracking and timesheet lifecycles
type Service interface {
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

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetDepartmentTasks(ctx context.Context, department string, activeOnly bool) ([]models.DepartmentTask, error) {
	return s.repo.GetDepartmentTasks(ctx, department, activeOnly)
}

func (s *service) CreateDepartmentTask(ctx context.Context, req models.CreateDepartmentTaskRequest, createdBy *uuid.UUID) (models.DepartmentTask, error) {
	if strings.TrimSpace(req.Department) == "" || strings.TrimSpace(req.TaskCode) == "" || strings.TrimSpace(req.TaskName) == "" {
		return models.DepartmentTask{}, ErrDeptTaskRequired
	}
	return s.repo.CreateDepartmentTask(ctx, req, createdBy)
}

func (s *service) UpdateDepartmentTask(ctx context.Context, id uuid.UUID, req models.UpdateDepartmentTaskRequest) (models.DepartmentTask, error) {
	return s.repo.UpdateDepartmentTask(ctx, id, req)
}

func (s *service) DeleteDepartmentTask(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteDepartmentTask(ctx, id)
}

func (s *service) GetMachineTasks(ctx context.Context, machineID uuid.UUID) ([]models.ProjectTask, error) {
	return s.repo.GetMachineTasks(ctx, machineID)
}

func (s *service) CreateProjectTask(ctx context.Context, machineID uuid.UUID, req models.CreateProjectTaskRequest, createdBy *uuid.UUID) (models.ProjectTask, error) {
	if strings.TrimSpace(req.TaskCode) == "" || strings.TrimSpace(req.TaskName) == "" || strings.TrimSpace(req.Department) == "" {
		return models.ProjectTask{}, ErrTaskRequired
	}
	return s.repo.CreateProjectTask(ctx, machineID, req, createdBy)
}

func (s *service) UpdateTaskQuote(ctx context.Context, taskID uuid.UUID, req models.UpdateTaskQuoteRequest) (models.ProjectTask, error) {
	return s.repo.UpdateTaskQuote(ctx, taskID, req)
}

func (s *service) GetMachineLaborSummary(ctx context.Context, machineID uuid.UUID) (models.MachineLaborSummary, error) {
	return s.repo.GetMachineLaborSummary(ctx, machineID)
}

func (s *service) GetQuotingReviewReport(ctx context.Context) ([]models.MachineLaborSummary, error) {
	return s.repo.GetQuotingReviewReport(ctx)
}

func (s *service) GetMachineLaborCorrelation(ctx context.Context, machineID uuid.UUID) (models.MachineLaborCorrelationReport, error) {
	return s.repo.GetMachineLaborCorrelation(ctx, machineID)
}

func (s *service) CreateTimeEntry(ctx context.Context, userID uuid.UUID, req models.CreateTimeEntryRequest) (models.TimeEntry, error) {
	if req.HoursSpent <= 0 || req.HoursSpent > 24 {
		return models.TimeEntry{}, ErrInvalidHours
	}
	return s.repo.CreateTimeEntry(ctx, userID, req)
}

func (s *service) GetTimeEntries(ctx context.Context, userID *uuid.UUID, machineID *uuid.UUID, startDate, endDate string) ([]models.TimeEntry, error) {
	return s.repo.GetTimeEntries(ctx, userID, machineID, startDate, endDate)
}

func (s *service) DeleteTimeEntry(ctx context.Context, id uuid.UUID, userID uuid.UUID, isAdminOrManager bool) error {
	return s.repo.DeleteTimeEntry(ctx, id, userID, isAdminOrManager)
}

func (s *service) FetchWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) (*models.WeeklyTimesheet, error) {
	return s.repo.FetchWeeklyTimesheet(ctx, timesheetID)
}

func (s *service) GetOrCreateWeeklyTimesheet(ctx context.Context, userID uuid.UUID, weekStart string) (*models.WeeklyTimesheet, error) {
	return s.repo.GetOrCreateWeeklyTimesheet(ctx, userID, weekStart)
}

func (s *service) SaveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, req models.WeeklyTimesheetSaveRequest, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return s.repo.SaveWeeklyTimesheet(ctx, timesheetID, req, authUserID, isAdminOrManager)
}

func (s *service) SubmitWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserUUID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return s.repo.SubmitWeeklyTimesheet(ctx, timesheetID, authUserUUID, authUserID, isAdminOrManager)
}

func (s *service) WithdrawWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return s.repo.WithdrawWeeklyTimesheet(ctx, timesheetID, authUserID, isAdminOrManager)
}

func (s *service) GetTimesheetApprovals(ctx context.Context, deptFilter, statusFilter, weekStartFilter string) ([]models.WeeklyTimesheet, error) {
	return s.repo.GetTimesheetApprovals(ctx, deptFilter, statusFilter, weekStartFilter)
}

func (s *service) ApproveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, approverID uuid.UUID) (*models.WeeklyTimesheet, error) {
	return s.repo.ApproveWeeklyTimesheet(ctx, timesheetID, approverID)
}

func (s *service) RejectWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, reason string) (*models.WeeklyTimesheet, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, ErrRejectReasonEmpty
	}
	return s.repo.RejectWeeklyTimesheet(ctx, timesheetID, reason)
}

func (s *service) DeleteWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) error {
	return s.repo.DeleteWeeklyTimesheet(ctx, timesheetID)
}
