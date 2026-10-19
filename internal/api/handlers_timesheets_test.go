package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func TestTimesheetHandlers(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create test sales order and machine
	var soID uuid.UUID
	poNum := fmt.Sprintf("PO-TS-TEST-%d", time.Now().UnixNano())
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, status)
		VALUES ('Timesheet Customer', $1, 'PRJ-TS-1', 'Feeder TS', 'open')
		RETURNING id
	`, poNum).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to create test sales order: %v", err)
	}

	var machineID uuid.UUID
	orderNum := fmt.Sprintf("M-TS-TEST-%d", time.Now().UnixNano())
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, $2, 'Centrifugal Feeder', 'assembly')
		RETURNING id
	`, soID, orderNum).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to create test machine: %v", err)
	}

	// Create test defect
	var defectID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status)
		VALUES ($1, 'assembly', 'design', 'Sensor bracket interference', 'moderate', 'open')
		RETURNING id
	`, machineID).Scan(&defectID)
	if err != nil {
		t.Fatalf("failed to create test defect: %v", err)
	}

	// Create test rework item
	var reworkID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO rework_items (sales_order_id, machine_id, defect_id, project_number, part_number, description, revision, material, reason_for_rework)
		VALUES ($1, $2, $3, 'PRJ-TS-1', 'TS-PART-100', 'Modified Bracket', 'A', 'Aluminum', 'Clearance defect')
		RETURNING id
	`, soID, machineID, defectID).Scan(&reworkID)
	if err != nil {
		t.Fatalf("failed to create test rework item: %v", err)
	}

	t.Cleanup(func() {
		_, _ = db.DB.Exec("DELETE FROM time_entries WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM project_tasks WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM rework_items WHERE id = $1", reworkID)
		_, _ = db.DB.Exec("DELETE FROM defects WHERE id = $1", defectID)
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	})

	managerCookie := createTestRoleCookie(t, "manager")
	leadCookie := createTestRoleCookie(t, "lead")
	workerCookie := createTestRoleCookie(t, "user")

	var createdTaskID uuid.UUID

	t.Run("Create_Project_Task_As_Manager_Success", func(t *testing.T) {
		taskReq := models.CreateProjectTaskRequest{
			TaskCode:    "mech_assembly",
			TaskName:    "Mechanical Assembly",
			Department:  "assembly",
			QuotedHours: 20.0,
		}
		body, _ := json.Marshal(taskReq)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/tasks", machineID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var task models.ProjectTask
		if err := json.NewDecoder(rr.Body).Decode(&task); err != nil {
			t.Fatalf("failed to decode task response: %v", err)
		}
		if task.QuotedHours != 20.0 || task.TaskCode != "mech_assembly" {
			t.Errorf("unexpected task data: %+v", task)
		}
		createdTaskID = task.ID
	})

	t.Run("Create_Project_Task_As_Worker_Forbidden", func(t *testing.T) {
		taskReq := models.CreateProjectTaskRequest{
			TaskCode:    "wiring",
			TaskName:    "Electrical Wiring",
			Department:  "controls",
			QuotedHours: 15.0,
		}
		body, _ := json.Marshal(taskReq)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/tasks", machineID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for worker, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("Update_Task_Quoted_Hours", func(t *testing.T) {
		newQuote := 25.0
		updateReq := models.UpdateTaskQuoteRequest{
			QuotedHours: &newQuote,
		}
		body, _ := json.Marshal(updateReq)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/tasks/%s/quote", createdTaskID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var updated models.ProjectTask
		_ = json.NewDecoder(rr.Body).Decode(&updated)
		if updated.QuotedHours != 25.0 {
			t.Errorf("expected quoted hours 25.0, got %f", updated.QuotedHours)
		}
	})

	var loggedProdEntryID uuid.UUID
	var loggedReworkEntryID uuid.UUID

	t.Run("Log_Production_Time_Entry", func(t *testing.T) {
		entryReq := models.CreateTimeEntryRequest{
			MachineID:       &machineID,
			EntryType:       models.TimeEntryTypeProduction,
			ProjectTaskID:   &createdTaskID,
			HoursSpent:      5.0,
			WorkDescription: "Base frame assembly and guide alignment",
		}
		body, _ := json.Marshal(entryReq)
		req := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var entry models.TimeEntry
		if err := json.NewDecoder(rr.Body).Decode(&entry); err != nil {
			t.Fatalf("failed to decode entry: %v", err)
		}
		if entry.HoursSpent != 5.0 {
			t.Errorf("expected 5.0 hours, got %f", entry.HoursSpent)
		}
		loggedProdEntryID = entry.ID
	})

	t.Run("Log_Rework_Time_Entry_Syncs_Rework_Item", func(t *testing.T) {
		entryReq := models.CreateTimeEntryRequest{
			MachineID:       &machineID,
			EntryType:       models.TimeEntryTypeRework,
			ReworkItemID:    &reworkID,
			HoursSpent:      2.5,
			WorkDescription: "Machining relief on sensor bracket",
		}
		body, _ := json.Marshal(entryReq)
		req := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var entry models.TimeEntry
		_ = json.NewDecoder(rr.Body).Decode(&entry)
		loggedReworkEntryID = entry.ID

		// Verify rework_items table actual_hours is now 2.5
		var rwActual float64
		err := db.DB.QueryRow("SELECT actual_hours FROM rework_items WHERE id = $1", reworkID).Scan(&rwActual)
		if err != nil || rwActual != 2.5 {
			t.Errorf("expected rework_items.actual_hours to be 2.5, got %f (err: %v)", rwActual, err)
		}
	})

	t.Run("Log_Issue_Fix_Time_Entry", func(t *testing.T) {
		entryReq := models.CreateTimeEntryRequest{
			MachineID:       &machineID,
			EntryType:       models.TimeEntryTypeIssueFix,
			DefectID:        &defectID,
			HoursSpent:      1.0,
			WorkDescription: "Troubleshooting electrical sensor connection",
		}
		body, _ := json.Marshal(entryReq)
		req := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("Get_Machine_Tasks_Shows_Actual_Hours_And_Variance", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/tasks", machineID), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var tasks []models.ProjectTask
		if err := json.NewDecoder(rr.Body).Decode(&tasks); err != nil {
			t.Fatalf("failed to decode tasks: %v", err)
		}
		if len(tasks) == 0 {
			t.Fatalf("expected at least 1 task")
		}

		t0 := tasks[0]
		if t0.QuotedHours != 25.0 {
			t.Errorf("expected quoted 25.0, got %f", t0.QuotedHours)
		}
		if t0.ActualHours != 5.0 {
			t.Errorf("expected actual 5.0, got %f", t0.ActualHours)
		}
		if t0.Variance != -20.0 {
			t.Errorf("expected variance -20.0, got %f", t0.Variance)
		}
	})

	t.Run("Get_Machine_Labor_Summary", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/labor-summary", machineID), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var summary models.MachineLaborSummary
		if err := json.NewDecoder(rr.Body).Decode(&summary); err != nil {
			t.Fatalf("failed to decode summary: %v", err)
		}

		if summary.TotalQuotedHours != 25.0 {
			t.Errorf("expected total quoted 25.0, got %f", summary.TotalQuotedHours)
		}
		if summary.TotalProductionHours != 5.0 {
			t.Errorf("expected total production 5.0, got %f", summary.TotalProductionHours)
		}
		if summary.TotalReworkHours != 2.5 {
			t.Errorf("expected total rework 2.5, got %f", summary.TotalReworkHours)
		}
		if summary.TotalIssueFixHours != 1.0 {
			t.Errorf("expected total issue fix 1.0, got %f", summary.TotalIssueFixHours)
		}
		if summary.TotalActualHours != 8.5 {
			t.Errorf("expected total actual 8.5, got %f", summary.TotalActualHours)
		}
		if summary.ProductionVariance != -20.0 {
			t.Errorf("expected production variance -20.0, got %f", summary.ProductionVariance)
		}
	})

	t.Run("Get_My_Time_Entries", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/time-entries/my", nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var entries []models.TimeEntry
		if err := json.NewDecoder(rr.Body).Decode(&entries); err != nil {
			t.Fatalf("failed to decode entries: %v", err)
		}
		if len(entries) < 3 {
			t.Errorf("expected at least 3 entries, got %d", len(entries))
		}
	})

	t.Run("Delete_Time_Entry_And_Recalculate", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/time-entries/%s", loggedReworkEntryID), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify rework_items table actual_hours is now 0.00
		var rwActual float64
		err := db.DB.QueryRow("SELECT actual_hours FROM rework_items WHERE id = $1", reworkID).Scan(&rwActual)
		if err != nil || rwActual != 0.0 {
			t.Errorf("expected rework_items.actual_hours to be 0.00 after deletion, got %f", rwActual)
		}

		// Also clean up prod entry
		_ = loggedProdEntryID
	})

	t.Run("Create_Time_Entry_Invalid_Hours_Fails", func(t *testing.T) {
		entryReq := models.CreateTimeEntryRequest{
			MachineID:     &machineID,
			EntryType:     models.TimeEntryTypeProduction,
			ProjectTaskID: &createdTaskID,
			HoursSpent:    -4.0, // Invalid negative
		}
		body, _ := json.Marshal(entryReq)
		req := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", rr.Code)
		}
	})

	var createdDeptTaskID uuid.UUID

	t.Run("Create_Department_Task_As_Manager_Success", func(t *testing.T) {
		reqPayload := models.CreateDepartmentTaskRequest{
			Department:         "controls",
			TaskCode:           "hmi_screen_design",
			TaskName:           "HMI Screen Design & Alarm Config",
			DefaultQuotedHours: 18.5,
		}
		body, _ := json.Marshal(reqPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/department-tasks", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}

		var dt models.DepartmentTask
		if err := json.NewDecoder(rr.Body).Decode(&dt); err != nil {
			t.Fatalf("failed to decode department task: %v", err)
		}
		if dt.TaskCode != "hmi_screen_design" || dt.DefaultQuotedHours != 18.5 {
			t.Errorf("unexpected department task data: %+v", dt)
		}
		createdDeptTaskID = dt.ID
	})

	t.Run("Create_Department_Task_As_Worker_Forbidden", func(t *testing.T) {
		reqPayload := models.CreateDepartmentTaskRequest{
			Department:         "assembly",
			TaskCode:           "unauthorized_task",
			TaskName:           "Unauthorized Task",
			DefaultQuotedHours: 10.0,
		}
		body, _ := json.Marshal(reqPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/department-tasks", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for worker, got %d", rr.Code)
		}
	})

	t.Run("Get_Department_Tasks_Filtered_By_Department", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/department-tasks?department=controls", nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rr.Code)
		}

		var list []models.DepartmentTask
		if err := json.NewDecoder(rr.Body).Decode(&list); err != nil {
			t.Fatalf("failed to decode list: %v", err)
		}
		if len(list) == 0 {
			t.Fatalf("expected at least 1 controls task")
		}
		found := false
		for _, task := range list {
			if task.TaskCode == "hmi_screen_design" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find hmi_screen_design in controls tasks")
		}
	})

	t.Run("Update_Department_Task_Name_And_Default_Quote", func(t *testing.T) {
		newName := "HMI Advanced Screen & Alarm Design"
		newQuote := 22.0
		reqPayload := models.UpdateDepartmentTaskRequest{
			TaskName:           &newName,
			DefaultQuotedHours: &newQuote,
		}
		body, _ := json.Marshal(reqPayload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/department-tasks/%s", createdDeptTaskID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var updated models.DepartmentTask
		_ = json.NewDecoder(rr.Body).Decode(&updated)
		if updated.TaskName != newName || updated.DefaultQuotedHours != 22.0 {
			t.Errorf("unexpected updated task: %+v", updated)
		}
	})

	t.Run("Update_Department_Task_Default_Quote_As_Lead_Success", func(t *testing.T) {
		leadQuote := 24.5
		reqPayload := models.UpdateDepartmentTaskRequest{
			DefaultQuotedHours: &leadQuote,
		}
		body, _ := json.Marshal(reqPayload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/department-tasks/%s", createdDeptTaskID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(leadCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for team lead, got %d: %s", rr.Code, rr.Body.String())
		}

		var updated models.DepartmentTask
		_ = json.NewDecoder(rr.Body).Decode(&updated)
		if updated.DefaultQuotedHours != 24.5 {
			t.Errorf("expected default quoted hours to be updated by lead to 24.5, got %v", updated.DefaultQuotedHours)
		}
	})

	t.Run("Delete_Department_Task_Deactivates", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/department-tasks/%s", createdDeptTaskID), nil)
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify task is now inactive and omitted from standard GET query
		getReq := httptest.NewRequest(http.MethodGet, "/api/department-tasks?department=controls", nil)
		getReq.AddCookie(workerCookie)

		getRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(getRR, getReq)

		var list []models.DepartmentTask
		_ = json.NewDecoder(getRR.Body).Decode(&list)
		for _, task := range list {
			if task.ID == createdDeptTaskID {
				t.Errorf("expected deactivated task to be excluded from default query")
			}
		}

		// Clean up created test task
		_, _ = db.DB.Exec("DELETE FROM department_tasks WHERE id = $1", createdDeptTaskID)
	})
}

func TestWeeklyTimesheetLifecycle(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create test sales order and machine
	var soID uuid.UUID
	poNum := fmt.Sprintf("PO-WT-TEST-%d", time.Now().UnixNano())
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, status)
		VALUES ('Weekly TS Customer', $1, 'PRJ-WT-1', 'Feeder WT', 'open')
		RETURNING id
	`, poNum).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to create test sales order: %v", err)
	}

	var machineID uuid.UUID
	orderNum := fmt.Sprintf("M-WT-TEST-%d", time.Now().UnixNano())
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, $2, 'Centrifugal Feeder', 'assembly')
		RETURNING id
	`, soID, orderNum).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to create test machine: %v", err)
	}

	var taskID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO project_tasks (machine_id, task_code, task_name, department, quoted_hours, status)
		VALUES ($1, 'mech_assy', 'Mechanical Assembly', 'assembly', 20.0, 'open')
		RETURNING id
	`, machineID).Scan(&taskID)
	if err != nil {
		t.Fatalf("failed to create test task: %v", err)
	}

	t.Cleanup(func() {
		_, _ = db.DB.Exec("DELETE FROM time_entries WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM project_tasks WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	})

	managerCookie := createTestRoleCookie(t, "manager")
	workerCookie := createTestRoleCookie(t, "user")

	weekSunday := "2026-10-18"
	var timesheetID uuid.UUID

	t.Run("Get_Weekly_Timesheet_Initializes_Draft", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/timesheets/weekly?week_start=%s", weekSunday), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var wt models.WeeklyTimesheet
		if err := json.NewDecoder(rr.Body).Decode(&wt); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if wt.Status != models.WeeklyTimesheetStatusDraft {
			t.Errorf("expected draft status, got %s", wt.Status)
		}
		if wt.TotalHours != 0.0 {
			t.Errorf("expected 0 total hours, got %v", wt.TotalHours)
		}
		if wt.WeekStartDate != weekSunday {
			t.Errorf("expected week_start %s, got %s", weekSunday, wt.WeekStartDate)
		}
		timesheetID = wt.ID
	})

	t.Run("Save_Weekly_Timesheet_Success", func(t *testing.T) {
		notes := "Week 42 assembly progress"
		saveReq := models.WeeklyTimesheetSaveRequest{
			Notes: &notes,
			Entries: []models.WeeklyTimesheetSaveItem{
				{
					MachineID:       &machineID,
					ProjectTaskID:   &taskID,
					EntryType:       models.TimeEntryTypeProduction,
					WorkDate:        "2026-10-19", // Monday
					HoursSpent:      4.5,
					WorkDescription: "Base plate mounting",
				},
				{
					MachineID:       &machineID,
					ProjectTaskID:   &taskID,
					EntryType:       models.TimeEntryTypeProduction,
					WorkDate:        "2026-10-20", // Tuesday
					HoursSpent:      3.5,
					WorkDescription: "Drive motor alignment",
				},
			},
		}

		body, _ := json.Marshal(saveReq)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/timesheets/weekly/%s/save", timesheetID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var wt models.WeeklyTimesheet
		_ = json.NewDecoder(rr.Body).Decode(&wt)

		if wt.TotalHours != 8.0 {
			t.Errorf("expected 8.0 total hours, got %v", wt.TotalHours)
		}
		if len(wt.Entries) != 2 {
			t.Fatalf("expected 2 entries, got %d", len(wt.Entries))
		}
		if wt.Notes != notes {
			t.Errorf("expected notes %s, got %s", notes, wt.Notes)
		}
	})

	t.Run("Save_Weekly_Timesheet_Validates_Hours_And_Date", func(t *testing.T) {
		// Test hours > 24
		saveReq := models.WeeklyTimesheetSaveRequest{
			Entries: []models.WeeklyTimesheetSaveItem{
				{
					MachineID:     &machineID,
					ProjectTaskID: &taskID,
					WorkDate:      "2026-10-19",
					HoursSpent:    25.0,
				},
			},
		}
		body, _ := json.Marshal(saveReq)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/timesheets/weekly/%s/save", timesheetID), bytes.NewReader(body))
		req.AddCookie(workerCookie)
		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for hours > 24, got %d", rr.Code)
		}

		// Test out of week date
		saveReq2 := models.WeeklyTimesheetSaveRequest{
			Entries: []models.WeeklyTimesheetSaveItem{
				{
					MachineID:     &machineID,
					ProjectTaskID: &taskID,
					WorkDate:      "2026-10-27", // Next week
					HoursSpent:    5.0,
				},
			},
		}
		body2, _ := json.Marshal(saveReq2)
		req2 := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/timesheets/weekly/%s/save", timesheetID), bytes.NewReader(body2))
		req2.AddCookie(workerCookie)
		rr2 := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for out-of-week date, got %d", rr2.Code)
		}
	})

	t.Run("Submit_Weekly_Timesheet_Transitions_To_Submitted", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/submit", timesheetID), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var wt models.WeeklyTimesheet
		_ = json.NewDecoder(rr.Body).Decode(&wt)
		if wt.Status != models.WeeklyTimesheetStatusSubmitted {
			t.Errorf("expected submitted status, got %s", wt.Status)
		}
		if wt.SubmittedAt == nil {
			t.Errorf("expected submitted_at timestamp to be set")
		}
	})

	t.Run("Can_Edit_Submitted_Timesheet_Before_Approval", func(t *testing.T) {
		saveReq := models.WeeklyTimesheetSaveRequest{
			Entries: []models.WeeklyTimesheetSaveItem{
				{
					MachineID:       &machineID,
					ProjectTaskID:   &taskID,
					WorkDate:        "2026-10-19",
					HoursSpent:      5.0,
					WorkDescription: "Base plate mounting & adjustments",
				},
			},
		}
		body, _ := json.Marshal(saveReq)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/timesheets/weekly/%s/save", timesheetID), bytes.NewReader(body))
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 when editing submitted timesheet, got %d: %s", rr.Code, rr.Body.String())
		}

		var wt models.WeeklyTimesheet
		_ = json.NewDecoder(rr.Body).Decode(&wt)
		if wt.TotalHours != 5.0 {
			t.Errorf("expected 5.0 total hours, got %v", wt.TotalHours)
		}
		if wt.Status != models.WeeklyTimesheetStatusSubmitted {
			t.Errorf("expected status to remain submitted, got %s", wt.Status)
		}
	})

	t.Run("Withdraw_Weekly_Timesheet_Returns_To_Draft", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/withdraw", timesheetID), nil)
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var wt models.WeeklyTimesheet
		_ = json.NewDecoder(rr.Body).Decode(&wt)
		if wt.Status != models.WeeklyTimesheetStatusDraft {
			t.Errorf("expected draft status after withdraw, got %s", wt.Status)
		}

		// Re-submit so lead can review
		submitReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/submit", timesheetID), nil)
		submitReq.AddCookie(workerCookie)
		submitRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(submitRR, submitReq)
		if submitRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on re-submit, got %d", submitRR.Code)
		}
	})

	t.Run("Manager_Approvals_List_And_Reject", func(t *testing.T) {
		// Manager lists submitted timesheets
		listReq := httptest.NewRequest(http.MethodGet, "/api/timesheets/approvals?status=submitted", nil)
		listReq.AddCookie(managerCookie)
		listRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(listRR, listReq)

		if listRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on approvals list, got %d", listRR.Code)
		}

		var list []models.WeeklyTimesheet
		_ = json.NewDecoder(listRR.Body).Decode(&list)
		found := false
		for _, item := range list {
			if item.ID == timesheetID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected timesheet %s to appear in manager approvals list", timesheetID)
		}

		// Reject timesheet
		rejectReqBody, _ := json.Marshal(models.RejectTimesheetRequest{
			Reason: "Needs review: Please confirm assembly task code",
		})
		rejReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/reject", timesheetID), bytes.NewReader(rejectReqBody))
		rejReq.Header.Set("Content-Type", "application/json")
		rejReq.AddCookie(managerCookie)

		rejRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rejRR, rejReq)

		if rejRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on reject, got %d: %s", rejRR.Code, rejRR.Body.String())
		}

		var rejectedWT models.WeeklyTimesheet
		_ = json.NewDecoder(rejRR.Body).Decode(&rejectedWT)
		if rejectedWT.Status != models.WeeklyTimesheetStatusRejected {
			t.Errorf("expected rejected status, got %s", rejectedWT.Status)
		}
		if rejectedWT.RejectionReason != "Needs review: Please confirm assembly task code" {
			t.Errorf("expected rejection reason to be saved, got %s", rejectedWT.RejectionReason)
		}
	})

	t.Run("Worker_Resubmits_And_Manager_Approves", func(t *testing.T) {
		// Worker can edit rejected timesheet and re-submit
		resubmitReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/submit", timesheetID), nil)
		resubmitReq.AddCookie(workerCookie)
		resubmitRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(resubmitRR, resubmitReq)
		if resubmitRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on worker re-submit, got %d", resubmitRR.Code)
		}

		// Manager approves
		approveReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/approve", timesheetID), nil)
		approveReq.AddCookie(managerCookie)
		approveRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(approveRR, approveReq)
		if approveRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on approve, got %d: %s", approveRR.Code, approveRR.Body.String())
		}

		var approvedWT models.WeeklyTimesheet
		_ = json.NewDecoder(approveRR.Body).Decode(&approvedWT)
		if approvedWT.Status != models.WeeklyTimesheetStatusApproved {
			t.Errorf("expected approved status, got %s", approvedWT.Status)
		}
		if approvedWT.ApprovedAt == nil {
			t.Errorf("expected approved_at timestamp to be set")
		}

		// Approved timesheet cannot be withdrawn by worker
		withdrawReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/timesheets/weekly/%s/withdraw", timesheetID), nil)
		withdrawReq.AddCookie(workerCookie)
		withdrawRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(withdrawRR, withdrawReq)
		if withdrawRR.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when attempting to withdraw approved timesheet, got %d", withdrawRR.Code)
		}

		// Approved timesheet cannot be edited by worker
		saveApprovedReq := models.WeeklyTimesheetSaveRequest{
			Entries: []models.WeeklyTimesheetSaveItem{
				{
					MachineID:     &machineID,
					ProjectTaskID: &taskID,
					WorkDate:      "2026-10-19",
					HoursSpent:    1.0,
				},
			},
		}
		saveApprovedBody, _ := json.Marshal(saveApprovedReq)
		editApprovedReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/timesheets/weekly/%s/save", timesheetID), bytes.NewReader(saveApprovedBody))
		editApprovedReq.AddCookie(workerCookie)
		editApprovedRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(editApprovedRR, editApprovedReq)
		if editApprovedRR.Code != http.StatusBadRequest {
			t.Errorf("expected 400 when attempting to edit approved timesheet, got %d", editApprovedRR.Code)
		}
	})

	// Cleanup test weekly timesheet
	_, _ = db.DB.Exec("DELETE FROM time_entries WHERE weekly_timesheet_id = $1", timesheetID)
	_, _ = db.DB.Exec("DELETE FROM weekly_timesheets WHERE id = $1", timesheetID)
}

func TestLaborCorrelationAndAuthoritativeTasks(t *testing.T) {
	setupTestDB(t)
	mux := http.NewServeMux()
	RegisterRoutes(mux)

	managerCookie := createTestRoleCookie(t, "manager")
	workerCookie := createTestRoleCookie(t, "user")

	// 1. Create a machine for testing
	var soID uuid.UUID
	poNum := fmt.Sprintf("PO-CORR-%d", time.Now().UnixNano())
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, status)
		VALUES ('Corr Customer', $1, 'PRJ-CORR-1', 'Feeder Corr', 'open')
		RETURNING id
	`, poNum).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to insert test sales order: %v", err)
	}

	var machineID uuid.UUID
	orderNum := fmt.Sprintf("M-CORR-%d", time.Now().UnixNano())
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, $2, 'VTR-2000', 'assembly')
		RETURNING id
	`, soID, orderNum).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to insert test machine: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM time_entries WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM project_tasks WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	}()

	var deptTaskID uuid.UUID

	t.Run("Create_Master_Task_Via_Alias_With_Description", func(t *testing.T) {
		desc := "Standard harness assembly and pinout verification"
		taskReq := models.CreateDepartmentTaskRequest{
			Department:         "Assembly",
			TaskCode:           "ASY-TEST-01",
			TaskName:           "Wire Harness Testing",
			Description:        &desc,
			DefaultQuotedHours: 6.0,
		}
		body, _ := json.Marshal(taskReq)
		req := httptest.NewRequest(http.MethodPost, "/api/tasks", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var created models.DepartmentTask
		if err := json.NewDecoder(rr.Body).Decode(&created); err != nil {
			t.Fatalf("failed to decode created task: %v", err)
		}
		if created.Description == nil || *created.Description != desc {
			t.Errorf("expected description %q, got %v", desc, created.Description)
		}
		deptTaskID = created.ID
	})

	defer func() {
		if deptTaskID != uuid.Nil {
			_, _ = db.DB.Exec("DELETE FROM department_tasks WHERE id = $1", deptTaskID)
		}
	}()

	var projectTaskID uuid.UUID

	t.Run("Create_Project_Task_Linked_To_Master_Task", func(t *testing.T) {
		ptReq := models.CreateProjectTaskRequest{
			TaskID:      &deptTaskID,
			TaskCode:    "ASY-TEST-01",
			TaskName:    "Wire Harness Testing",
			Department:  "Assembly",
			QuotedHours: 8.0,
		}
		body, _ := json.Marshal(ptReq)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/tasks", machineID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(managerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var pt models.ProjectTask
		_ = json.NewDecoder(rr.Body).Decode(&pt)
		if pt.TaskID == nil || *pt.TaskID != deptTaskID {
			t.Errorf("expected project task task_id to link to %s, got %v", deptTaskID, pt.TaskID)
		}
		projectTaskID = pt.ID
	})

	t.Run("Log_Time_And_Verify_Machine_Labor_Correlation", func(t *testing.T) {
		// Worker logs 10 hours on the 8-hour budgeted task -> should show over budget
		timeReq := models.CreateTimeEntryRequest{
			MachineID:       &machineID,
			ProjectTaskID:   &projectTaskID,
			EntryType:       models.TimeEntryTypeProduction,
			WorkDate:        "2026-10-19",
			HoursSpent:      10.0,
			WorkDescription: "Wire Harness Testing",
		}
		body, _ := json.Marshal(timeReq)
		req := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(workerCookie)

		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)
		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Also log 2 hours of unbudgeted work (task without project_tasks quote)
		unbudgetedReq := models.CreateTimeEntryRequest{
			MachineID:       &machineID,
			EntryType:       models.TimeEntryTypeProduction,
			WorkDate:        "2026-10-20",
			HoursSpent:      2.0,
			WorkDescription: "Unbudgeted Emergency Rework",
		}
		unbudgetedBody, _ := json.Marshal(unbudgetedReq)
		req2 := httptest.NewRequest(http.MethodPost, "/api/time-entries", bytes.NewReader(unbudgetedBody))
		req2.Header.Set("Content-Type", "application/json")
		req2.AddCookie(workerCookie)

		rr2 := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusCreated {
			t.Fatalf("expected 201 for unbudgeted entry, got %d: %s", rr2.Code, rr2.Body.String())
		}

		// Fetch labor correlation report
		corrReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/labor-correlation", machineID), nil)
		corrReq.AddCookie(managerCookie)
		corrRR := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(corrRR, corrReq)

		if corrRR.Code != http.StatusOK {
			t.Fatalf("expected 200 on labor-correlation, got %d: %s", corrRR.Code, corrRR.Body.String())
		}

		var report models.MachineLaborCorrelationReport
		if err := json.NewDecoder(corrRR.Body).Decode(&report); err != nil {
			t.Fatalf("failed to decode correlation report: %v", err)
		}

		if report.TotalAssignedHours != 8.0 {
			t.Errorf("expected TotalAssignedHours 8.0, got %v", report.TotalAssignedHours)
		}
		if report.TotalConsumedHours != 12.0 {
			t.Errorf("expected TotalConsumedHours 12.0 (10 + 2), got %v", report.TotalConsumedHours)
		}
		if report.NetVariance != 4.0 {
			t.Errorf("expected NetVariance 4.0, got %v", report.NetVariance)
		}
		if report.OverallBurnPercentage != 150.0 {
			t.Errorf("expected OverallBurnPercentage 150.0%%, got %v", report.OverallBurnPercentage)
		}

		// Verify task statuses
		var foundBudgeted, foundUnbudgeted bool
		for _, item := range report.Tasks {
			if item.TaskName == "Wire Harness Testing" {
				foundBudgeted = true
				if item.Status != models.CorrelationStatusOverBudget {
					t.Errorf("expected Wire Harness Testing status %s, got %s", models.CorrelationStatusOverBudget, item.Status)
				}
				if item.BurnPercentage != 125.0 {
					t.Errorf("expected burn 125%%, got %v", item.BurnPercentage)
				}
			}
			if item.TaskName == "Unbudgeted Emergency Rework" {
				foundUnbudgeted = true
				if item.Status != models.CorrelationStatusUnbudgeted {
					t.Errorf("expected unbudgeted status %s, got %s", models.CorrelationStatusUnbudgeted, item.Status)
				}
			}
		}

		if !foundBudgeted {
			t.Errorf("budgeted task not found in report tasks: %+v", report.Tasks)
		}
		if !foundUnbudgeted {
			t.Errorf("unbudgeted task not found in report tasks: %+v", report.Tasks)
		}
	})
}


