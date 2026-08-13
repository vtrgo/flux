package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vtrgo/flux/internal/models"
)

func TestMachines(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	t.Run("Create Machine - Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"order_number": "M-TEST-001",
			"model_type":   "ModelX",
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

		if resp.OrderNumber != "M-TEST-001" {
			t.Errorf("expected machine order number M-TEST-001, got %v", resp.OrderNumber)
		}
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
}
