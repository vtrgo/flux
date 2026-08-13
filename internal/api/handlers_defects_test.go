package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDefects(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

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
