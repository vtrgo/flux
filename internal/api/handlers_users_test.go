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

func TestUsersEndpoints(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create test users in different departments
	uniqueSuffix := time.Now().UnixNano()
	userAssembly := map[string]interface{}{
		"username":   fmt.Sprintf("asm_tech_%d", uniqueSuffix),
		"first_name": "Assembly",
		"last_name":  "Tech",
		"department": "assembly",
		"role":       "technician",
		"password":   "password123",
	}
	userControls := map[string]interface{}{
		"username":   fmt.Sprintf("ctrl_tech_%d", uniqueSuffix),
		"first_name": "Controls",
		"last_name":  "Tech",
		"department": "electrical_controls",
		"role":       "technician",
		"password":   "password123",
	}

	for _, u := range []map[string]interface{}{userAssembly, userControls} {
		body, _ := json.Marshal(u)
		req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewReader(body))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != http.StatusCreated {
			t.Fatalf("Failed to create test user: %v", rr.Body.String())
		}
	}

	t.Run("Get Users - Unfiltered Returns All", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", rr.Code)
		}

		var users []models.User
		if err := json.NewDecoder(rr.Body).Decode(&users); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(users) < 2 {
			t.Errorf("Expected at least 2 users, got %d", len(users))
		}
	})

	t.Run("Get Users - Filtered by Department", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users?department=assembly", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", rr.Code)
		}

		var users []models.User
		if err := json.NewDecoder(rr.Body).Decode(&users); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		for _, u := range users {
			if u.Department == nil || *u.Department != "assembly" {
				t.Errorf("Expected department assembly, got %v", u.Department)
			}
		}
	})
}
