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

