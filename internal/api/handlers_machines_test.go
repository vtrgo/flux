package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"fmt"

	"github.com/vtrgo/flux/internal/models"
)

func TestMachines(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	var createdMachineID string
	var uniqueOrderNumber string

	t.Run("Create Machine - Success", func(t *testing.T) {
		uniqueOrderNumber = fmt.Sprintf("M-TEST-%d", time.Now().UnixNano())
		payload := map[string]interface{}{
			"order_number": uniqueOrderNumber,
			"model_type":   "ModelX",
			"lead":         "John Lead",
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/machines", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusCreated)
		}

		var resp models.Machine
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Errorf("failed to decode response: %v", err)
		}

		if resp.OrderNumber != uniqueOrderNumber {
			t.Errorf("expected machine order number %v, got %v", uniqueOrderNumber, resp.OrderNumber)
		}
		if resp.Lead == nil || *resp.Lead != "John Lead" {
			t.Errorf("expected lead 'John Lead', got %v", resp.Lead)
		}
		
		createdMachineID = resp.ID.String()
	})

	t.Run("Create Machine - Missing Fields (Failure)", func(t *testing.T) {
		payload := map[string]interface{}{
			"model_type": "ModelY",
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/machines", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("handler returned wrong status code for missing fields: got %v want %v", status, http.StatusBadRequest)
		}
	})

	t.Run("Get All Machines - Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		var resp []models.Machine
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Errorf("failed to decode response: %v", err)
		}

		if len(resp) == 0 {
			t.Errorf("expected at least 1 machine, got 0")
		}
	})

	t.Run("Update Machine FAT Date and Lead - Success", func(t *testing.T) {
		newFat := time.Now().AddDate(0, 0, 7).Truncate(time.Second)
		payload := map[string]interface{}{
			"model_type": "ModelUpdated",
			"fat_date":   newFat.Format(time.RFC3339),
			"lead":       "Jane Lead",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/machines/"+createdMachineID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", status, rr.Body.String())
		}
		var resp models.Machine
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if resp.FATDate == nil {
			t.Errorf("expected FATDate to be non-nil")
		}
		if resp.ModelType != "ModelUpdated" {
			t.Errorf("expected ModelType to be ModelUpdated, got %s", resp.ModelType)
		}
		if resp.Lead == nil || *resp.Lead != "Jane Lead" {
			t.Errorf("expected Lead to be 'Jane Lead', got %v", resp.Lead)
		}
	})

	t.Run("Update Machine - 404 Not Found", func(t *testing.T) {
		payload := map[string]interface{}{
			"model_type": "GhostModel",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/machines/00000000-0000-0000-0000-000000000000", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusNotFound {
			t.Errorf("expected 404, got %d", status)
		}
	})

	t.Run("Update Machine - Invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/api/machines/"+createdMachineID, bytes.NewReader([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", status)
		}
	})

	t.Run("Delete Machine - Authorization Checks", func(t *testing.T) {
		if createdMachineID == "" {
			t.Skip("Skipping delete test because machine was not created")
		}

		// 1. Non-admin request should fail with 403 Forbidden
		reqUnauth := httptest.NewRequest(http.MethodDelete, "/api/machines/"+createdMachineID, nil)
		rrUnauth := httptest.NewRecorder()
		mux.ServeHTTP(rrUnauth, reqUnauth)
		if rrUnauth.Code != http.StatusUnauthorized {
			t.Errorf("handler returned wrong status code for unauthenticated delete: got %v want %v", rrUnauth.Code, http.StatusUnauthorized)
		}

		// 2. Admin request should succeed with 200 OK
		adminCookie := createTestRoleCookie(t, "manager")
		reqAuth := httptest.NewRequest(http.MethodDelete, "/api/machines/"+createdMachineID, nil)
		reqAuth.AddCookie(adminCookie)
		rrAuth := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rrAuth, reqAuth)

		if status := rrAuth.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code for admin: got %v want %v", status, http.StatusOK)
		}
	})
}
