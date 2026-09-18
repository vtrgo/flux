package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vtrgo/flux/internal/models"
)

func TestDefects(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create a test machine first
	uniqueOrderNumber := fmt.Sprintf("M-DEFECT-TEST-%d", time.Now().UnixNano())
	machPayload := map[string]interface{}{
		"order_number": uniqueOrderNumber,
		"model_type":   "ModelDefectTest",
	}
	machBody, _ := json.Marshal(machPayload)
	machReq := httptest.NewRequest(http.MethodPost, "/api/machines", bytes.NewReader(machBody))
	machReq.Header.Set("Content-Type", "application/json")
	machRr := httptest.NewRecorder()
	mux.ServeHTTP(machRr, machReq)

	if machRr.Code != http.StatusCreated {
		t.Fatalf("Failed to create test machine: %v", machRr.Body.String())
	}
	var createdMachine models.Machine
	if err := json.NewDecoder(machRr.Body).Decode(&createdMachine); err != nil {
		t.Fatalf("Failed to decode machine: %v", err)
	}

	var defectID string

	t.Run("Create Defect - Success with CreatedAt Timestamp", func(t *testing.T) {
		payload := map[string]interface{}{
			"source_department":   "quality",
			"assigned_department": "assembly",
			"severity":            "moderate",
			"description":         "Bolt loose on station 3",
			"notes":               "Needs torque wrench verification",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Fatalf("handler returned wrong status code: got %v want %v", status, http.StatusCreated)
		}

		var defect models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&defect); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if defect.ID.String() == "" {
			t.Error("expected non-empty defect ID")
		}
		if defect.CreatedAt.IsZero() {
			t.Error("expected non-zero CreatedAt timestamp on defect creation")
		}
		if defect.ResolvedAt != nil {
			t.Errorf("expected nil ResolvedAt on new defect, got %v", defect.ResolvedAt)
		}
		if defect.Status != "open" {
			t.Errorf("expected status 'open', got %s", defect.Status)
		}
		defectID = defect.ID.String()
	})

	t.Run("Update Defect to Fixed - Sets ResolvedAt Timestamp", func(t *testing.T) {
		payload := map[string]interface{}{
			"status": "fixed",
			"notes":  "Torqued to specification",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/defects/%s", defectID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		var updated models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&updated); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if updated.Status != "fixed" {
			t.Errorf("expected status 'fixed', got %s", updated.Status)
		}
		if updated.ResolvedAt == nil {
			t.Error("expected non-nil ResolvedAt timestamp after marking fixed")
		}
		if updated.CreatedAt.IsZero() {
			t.Error("expected CreatedAt timestamp to persist after update")
		}
	})

	t.Run("Reopen Defect - Resets ResolvedAt to NULL", func(t *testing.T) {
		payload := map[string]interface{}{
			"status": "open",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/defects/%s", defectID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		var reopened models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&reopened); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if reopened.Status != "open" {
			t.Errorf("expected status 'open', got %s", reopened.Status)
		}
		if reopened.ResolvedAt != nil {
			t.Errorf("expected nil ResolvedAt after reopening defect, got %v", reopened.ResolvedAt)
		}
	})

	t.Run("Get Machine Defects - Returns CreatedAt and ResolvedAt", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		var defects []models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&defects); err != nil {
			t.Fatalf("failed to decode defects: %v", err)
		}

		if len(defects) == 0 {
			t.Fatal("expected at least 1 defect for test machine")
		}
		if defects[0].CreatedAt.IsZero() {
			t.Error("expected non-zero CreatedAt in machine defects list")
		}
	})

	t.Run("Get All Defects - Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/defects", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}
	})

	t.Run("Get Machine Defects - Not Found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines/00000000-0000-0000-0000-000000000000/defects", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}
	})

	t.Run("Create Defect - Missing Machine ID (Failure)", func(t *testing.T) {
		payload := map[string]interface{}{
			"severity":    "minor",
			"description": "Test defect",
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/machines/00000000-0000-0000-0000-000000000000/defects", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusInternalServerError {
			t.Errorf("expected 500 error on foreign key violation, got %v", status)
		}
	})

	t.Run("Get Machine Defects Summary - Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines/00000000-0000-0000-0000-000000000000/defects/summary", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}
	})

	t.Run("Create Defect with DueDate - Success", func(t *testing.T) {
		dueDateStr := "2026-09-30T12:00:00Z"
		expectedDate, _ := time.Parse(time.RFC3339, dueDateStr)
		payload := map[string]interface{}{
			"source_department":   "quality",
			"assigned_department": "machine_shop",
			"severity":            "critical",
			"description":         "Milling error on track alignment",
			"notes":               "Detailed rework notes: machine down by 1.5mm",
			"due_date":            dueDateStr,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Fatalf("handler returned wrong status code: got %v want %v", status, http.StatusCreated)
		}

		var defect models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&defect); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if defect.DueDate == nil {
			t.Fatal("expected non-nil DueDate on created defect")
		}
		if !defect.DueDate.Equal(expectedDate) {
			t.Errorf("expected DueDate %s, got %s", expectedDate, *defect.DueDate)
		}
	})

	t.Run("Create Defect - Description Exceeds 255 Characters (Failure)", func(t *testing.T) {
		longDescription := string(make([]byte, 256))
		for i := range longDescription {
			longDescription = longDescription[:i] + "a" + longDescription[i+1:]
		}
		payload := map[string]interface{}{
			"source_department":   "quality",
			"assigned_department": "assembly",
			"severity":            "minor",
			"description":         longDescription,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for description > 255 chars, got %v", status)
		}
	})

	t.Run("Edit Defect - Updates DueDate and Notes", func(t *testing.T) {
		newDueDate := "2026-10-15T12:00:00Z"
		expectedDate, _ := time.Parse(time.RFC3339, newDueDate)
		newNotes := "Expanded rework instructions for tooling department"
		payload := map[string]interface{}{
			"source_department":   "quality",
			"assigned_department": "design",
			"severity":            "moderate",
			"description":         "Updated brief description",
			"notes":               newNotes,
			"due_date":            newDueDate,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/defects/%s/edit", defectID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("handler returned wrong status code: got %v want %v (body: %s)", status, http.StatusOK, rr.Body.String())
		}

		var updated models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&updated); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if updated.DueDate == nil || !updated.DueDate.Equal(expectedDate) {
			t.Errorf("expected DueDate %s, got %v", expectedDate, updated.DueDate)
		}
		if updated.Notes == nil || *updated.Notes != newNotes {
			t.Errorf("expected Notes %s, got %v", newNotes, updated.Notes)
		}
	})

	t.Run("Create Defect with SendNotification - Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"source_department":   "quality",
			"assigned_department": "assembly",
			"severity":            "critical",
			"description":         "Defect routed to notifications",
			"notes":               "Notification flow test",
			"send_notification":   true,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Fatalf("handler returned wrong status code: got %v want %v (body: %s)", status, http.StatusCreated, rr.Body.String())
		}

		var defect models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&defect); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if defect.ID.String() == "" {
			t.Error("expected non-empty defect ID")
		}
		if defect.Description != "Defect routed to notifications" {
			t.Errorf("expected description 'Defect routed to notifications', got '%s'", defect.Description)
		}
	})

	t.Run("Create Defect - Assigned to Quality / PM (Success)", func(t *testing.T) {
		payload := map[string]interface{}{
			"source_department":   "assembly",
			"assigned_department": "quality",
			"severity":            "moderate",
			"description":         "Documentation and FAT signoff pending by Quality / PM",
			"notes":               "Customer FAT checklist needs PM review",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/machines/%s/defects", createdMachine.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Fatalf("handler returned wrong status code: got %v want %v (body: %s)", status, http.StatusCreated, rr.Body.String())
		}

		var defect models.Defect
		if err := json.NewDecoder(rr.Body).Decode(&defect); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if defect.AssignedDepartment != "quality" {
			t.Errorf("expected assigned_department 'quality', got '%s'", defect.AssignedDepartment)
		}
	})
}


