package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vtrgo/flux/internal/models"
)

func TestTimezoneEndpoints(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	t.Run("Get Timezone - Default / Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/system/timezone", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp models.TimezoneResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Timezone == "" {
			t.Errorf("Expected non-empty timezone, got empty string")
		}
	})

	t.Run("Get Available Timezones - Predefined List", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/system/timezones", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var options []models.TimezoneOption
		if err := json.NewDecoder(rr.Body).Decode(&options); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(options) == 0 {
			t.Errorf("Expected list of timezone options, got empty list")
		}

		// Ensure America/Toronto is in the list
		found := false
		for _, opt := range options {
			if opt.ID == "America/Toronto" {
				found = true
				if opt.Offset == "" {
					t.Errorf("Expected offset to be populated for America/Toronto")
				}
				break
			}
		}
		if !found {
			t.Errorf("Expected America/Toronto in predefined timezones list")
		}
	})

	t.Run("Update Timezone - Unauthorized without Admin", func(t *testing.T) {
		body, _ := json.Marshal(models.UpdateTimezoneRequest{Timezone: "America/New_York"})

		// 1. Completely unauthenticated
		reqUnauth := httptest.NewRequest(http.MethodPut, "/api/system/timezone", bytes.NewReader(body))
		rrUnauth := httptest.NewRecorder()
		mux.ServeHTTP(rrUnauth, reqUnauth)
		if rrUnauth.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized for unauthenticated update, got %d", rrUnauth.Code)
		}

		// 2. Technician role (forbidden)
		techCookie := createTestRoleCookie(t, "technician")
		reqTech := httptest.NewRequest(http.MethodPut, "/api/system/timezone", bytes.NewReader(body))
		reqTech.AddCookie(techCookie)
		rrTech := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rrTech, reqTech)
		if rrTech.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden for non-admin user, got %d", rrTech.Code)
		}
	})

	t.Run("Update Timezone - Invalid Timezone Rejected", func(t *testing.T) {
		adminCookie := createTestRoleCookie(t, "admin")
		body, _ := json.Marshal(models.UpdateTimezoneRequest{Timezone: "Mars/Olympus_Mons"})

		req := httptest.NewRequest(http.MethodPut, "/api/system/timezone", bytes.NewReader(body))
		req.AddCookie(adminCookie)
		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request for invalid timezone, got %d", rr.Code)
		}
	})

	t.Run("Update Timezone - Admin Success", func(t *testing.T) {
		adminCookie := createTestRoleCookie(t, "admin")
		targetTz := "America/Chicago"
		body, _ := json.Marshal(models.UpdateTimezoneRequest{Timezone: targetTz})

		req := httptest.NewRequest(http.MethodPut, "/api/system/timezone", bytes.NewReader(body))
		req.AddCookie(adminCookie)
		rr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for admin update, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify retrieval
		getReq := httptest.NewRequest(http.MethodGet, "/api/system/timezone", nil)
		getRr := httptest.NewRecorder()
		mux.ServeHTTP(getRr, getReq)

		var resp models.TimezoneResponse
		if err := json.NewDecoder(getRr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Timezone != targetTz {
			t.Errorf("Expected timezone %s, got %s", targetTz, resp.Timezone)
		}

		// Restore default America/Toronto
		restoreBody, _ := json.Marshal(models.UpdateTimezoneRequest{Timezone: "America/Toronto"})
		restoreReq := httptest.NewRequest(http.MethodPut, "/api/system/timezone", bytes.NewReader(restoreBody))
		restoreReq.AddCookie(adminCookie)
		restoreRr := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(restoreRr, restoreReq)
		if restoreRr.Code != http.StatusOK {
			t.Fatalf("Failed to restore default timezone: %s", restoreRr.Body.String())
		}
	})
}
