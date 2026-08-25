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
}
