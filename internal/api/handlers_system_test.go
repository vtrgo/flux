package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSystemVersionEndpoint(t *testing.T) {
	mux := http.NewServeMux()
	RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/system/version", nil)
	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp SystemVersionResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Version == "" {
		t.Errorf("Expected non-empty version")
	}

	if resp.Environment == "" {
		t.Errorf("Expected environment to be populated")
	}

	if len(resp.RecentReleases) == 0 {
		t.Errorf("Expected recent releases list to be non-empty")
	}
}
