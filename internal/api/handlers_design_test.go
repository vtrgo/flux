package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDesign(t *testing.T) {
	setupTestDB(t)
	mux := http.NewServeMux()
	RegisterRoutes(mux)

	t.Run("Get All Design Feedback - Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/design/feedback", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}
	})
}
