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

	t.Run("Delete Machine - Success", func(t *testing.T) {
		if createdMachineID == "" {
			t.Skip("Skipping delete test because machine was not created")
		}
		req := httptest.NewRequest(http.MethodDelete, "/api/machines/"+createdMachineID, nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}
	})
}
