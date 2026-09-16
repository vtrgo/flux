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
		req.AddCookie(createTestRoleCookie(t, "admin"))
		AuthMiddleware(mux).ServeHTTP(rr, req)
		if rr.Code != http.StatusCreated {
			t.Fatalf("Failed to create test user: %v", rr.Body.String())
		}
	}

	t.Run("Get Users - Unfiltered Returns All", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
		rr := httptest.NewRecorder()
		req.AddCookie(createTestRoleCookie(t, "admin"))
		AuthMiddleware(mux).ServeHTTP(rr, req)

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
		req.AddCookie(createTestRoleCookie(t, "admin"))
		AuthMiddleware(mux).ServeHTTP(rr, req)

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

	t.Run("Create and Update User with Email - Success", func(t *testing.T) {
		email := fmt.Sprintf("tech_%d@vtrfeedersolutions.com", uniqueSuffix)
		userPayload := map[string]interface{}{
			"username":   fmt.Sprintf("user_email_%d", uniqueSuffix),
			"email":      email,
			"first_name": "Justin",
			"last_name":  "VTR",
			"department": "quality",
			"role":       "admin",
			"password":   "secret123",
		}

		body, _ := json.Marshal(userPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewReader(body))
		rr := httptest.NewRecorder()
		req.AddCookie(createTestRoleCookie(t, "admin"))
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d (body: %s)", rr.Code, rr.Body.String())
		}

		var created models.User
		if err := json.NewDecoder(rr.Body).Decode(&created); err != nil {
			t.Fatalf("Failed to decode created user: %v", err)
		}

		if created.Email == nil || *created.Email != email {
			t.Errorf("Expected email %s, got %v", email, created.Email)
		}

		// Update user email
		updatedEmail := fmt.Sprintf("updated_%d@vtrfeedersolutions.com", uniqueSuffix)
		updatePayload := map[string]interface{}{
			"username":   created.Username,
			"email":      updatedEmail,
			"first_name": "Justin",
			"last_name":  "Updated",
			"department": "quality",
			"role":       "admin",
		}

		upBody, _ := json.Marshal(updatePayload)
		upReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/users/%s", created.ID), bytes.NewReader(upBody))
		upRr := httptest.NewRecorder()
		upReq.AddCookie(createTestRoleCookie(t, "admin"))
		AuthMiddleware(mux).ServeHTTP(upRr, upReq)

		if upRr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on update, got %d (body: %s)", upRr.Code, upRr.Body.String())
		}

		var updated models.User
		if err := json.NewDecoder(upRr.Body).Decode(&updated); err != nil {
			t.Fatalf("Failed to decode updated user: %v", err)
		}

		if updated.Email == nil || *updated.Email != updatedEmail {
			t.Errorf("Expected email %s, got %v", updatedEmail, updated.Email)
		}
	})
}

