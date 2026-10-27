package timesheets

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

type mockTimesheetRepository struct {
	deptTasks       []models.DepartmentTask
	deptTask        models.DepartmentTask
	projTasks       []models.ProjectTask
	projTask        models.ProjectTask
	laborSummary    models.MachineLaborSummary
	correlationRep  models.MachineLaborCorrelationReport
	timeEntries     []models.TimeEntry
	timeEntry       models.TimeEntry
	weeklyTimesheet *models.WeeklyTimesheet
	approvals       []models.WeeklyTimesheet
	err             error
}

func (m *mockTimesheetRepository) GetDepartmentTasks(ctx context.Context, department string, activeOnly bool) ([]models.DepartmentTask, error) {
	return m.deptTasks, m.err
}

func (m *mockTimesheetRepository) CreateDepartmentTask(ctx context.Context, req models.CreateDepartmentTaskRequest, createdBy *uuid.UUID) (models.DepartmentTask, error) {
	return m.deptTask, m.err
}

func (m *mockTimesheetRepository) UpdateDepartmentTask(ctx context.Context, id uuid.UUID, req models.UpdateDepartmentTaskRequest) (models.DepartmentTask, error) {
	return m.deptTask, m.err
}

func (m *mockTimesheetRepository) DeleteDepartmentTask(ctx context.Context, id uuid.UUID) error {
	return m.err
}

func (m *mockTimesheetRepository) GetMachineTasks(ctx context.Context, machineID uuid.UUID) ([]models.ProjectTask, error) {
	return m.projTasks, m.err
}

func (m *mockTimesheetRepository) CreateProjectTask(ctx context.Context, machineID uuid.UUID, req models.CreateProjectTaskRequest, createdBy *uuid.UUID) (models.ProjectTask, error) {
	return m.projTask, m.err
}

func (m *mockTimesheetRepository) UpdateTaskQuote(ctx context.Context, taskID uuid.UUID, req models.UpdateTaskQuoteRequest) (models.ProjectTask, error) {
	return m.projTask, m.err
}

func (m *mockTimesheetRepository) GetMachineLaborSummary(ctx context.Context, machineID uuid.UUID) (models.MachineLaborSummary, error) {
	return m.laborSummary, m.err
}

func (m *mockTimesheetRepository) GetQuotingReviewReport(ctx context.Context) ([]models.MachineLaborSummary, error) {
	return []models.MachineLaborSummary{m.laborSummary}, m.err
}

func (m *mockTimesheetRepository) GetMachineLaborCorrelation(ctx context.Context, machineID uuid.UUID) (models.MachineLaborCorrelationReport, error) {
	return m.correlationRep, m.err
}

func (m *mockTimesheetRepository) CreateTimeEntry(ctx context.Context, userID uuid.UUID, req models.CreateTimeEntryRequest) (models.TimeEntry, error) {
	return m.timeEntry, m.err
}

func (m *mockTimesheetRepository) GetTimeEntries(ctx context.Context, userID *uuid.UUID, machineID *uuid.UUID, startDate, endDate string) ([]models.TimeEntry, error) {
	return m.timeEntries, m.err
}

func (m *mockTimesheetRepository) DeleteTimeEntry(ctx context.Context, id uuid.UUID, userID uuid.UUID, isAdminOrManager bool) error {
	return m.err
}

func (m *mockTimesheetRepository) FetchWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) GetOrCreateWeeklyTimesheet(ctx context.Context, userID uuid.UUID, weekStart string) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) SaveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, req models.WeeklyTimesheetSaveRequest, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) SubmitWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserUUID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) WithdrawWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, authUserID string, isAdminOrManager bool) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) GetTimesheetApprovals(ctx context.Context, deptFilter, statusFilter, weekStartFilter string) ([]models.WeeklyTimesheet, error) {
	return m.approvals, m.err
}

func (m *mockTimesheetRepository) ApproveWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, approverID uuid.UUID) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) RejectWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID, reason string) (*models.WeeklyTimesheet, error) {
	return m.weeklyTimesheet, m.err
}

func (m *mockTimesheetRepository) DeleteWeeklyTimesheet(ctx context.Context, timesheetID uuid.UUID) error {
	return m.err
}

func TestTimesheetService_CreateDepartmentTask_Validation(t *testing.T) {
	svc := NewService(&mockTimesheetRepository{})

	_, err := svc.CreateDepartmentTask(context.Background(), models.CreateDepartmentTaskRequest{}, nil)
	if err != ErrDeptTaskRequired {
		t.Fatalf("expected ErrDeptTaskRequired, got %v", err)
	}
}

func TestTimesheetService_CreateTimeEntry_Validation(t *testing.T) {
	svc := NewService(&mockTimesheetRepository{})

	// 0 hours
	_, err := svc.CreateTimeEntry(context.Background(), uuid.New(), models.CreateTimeEntryRequest{HoursSpent: 0})
	if err != ErrInvalidHours {
		t.Fatalf("expected ErrInvalidHours, got %v", err)
	}

	// > 24 hours
	_, err = svc.CreateTimeEntry(context.Background(), uuid.New(), models.CreateTimeEntryRequest{HoursSpent: 25})
	if err != ErrInvalidHours {
		t.Fatalf("expected ErrInvalidHours, got %v", err)
	}
}

func TestTimesheetService_RejectWeeklyTimesheet_Validation(t *testing.T) {
	svc := NewService(&mockTimesheetRepository{})

	_, err := svc.RejectWeeklyTimesheet(context.Background(), uuid.New(), "")
	if err != ErrRejectReasonEmpty {
		t.Fatalf("expected ErrRejectReasonEmpty, got %v", err)
	}
}
