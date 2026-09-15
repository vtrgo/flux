package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

// mockAuthenticator implements Authenticator for testing without hitting live DB
type mockAuthenticator struct {
	authenticatedUser *models.User
	shouldFail        bool
}

func (m *mockAuthenticator) Authenticate(ctx context.Context, username, password string) (*models.User, error) {
	if m.shouldFail {
		return nil, ErrInvalidCredentials
	}
	return m.authenticatedUser, nil
}

func TestAuthHandlers(t *testing.T) {
	// Override JWT_SECRET to verify dynamic key reading
	_ = os.Setenv("JWT_SECRET", "test_secret_for_futureproofing_auth")
	defer func() {
		_ = os.Unsetenv("JWT_SECRET")
	}()

	testUserID := uuid.New()
	testUser := &models.User{
		ID:           testUserID,
		Username:     "jdoe",
		AuthProvider: "local",
	}

	origAuth := DefaultAuthenticator
	defer func() { DefaultAuthenticator = origAuth }()

	t.Run("Login - Success and Cookie Generation", func(t *testing.T) {
		DefaultAuthenticator = &mockAuthenticator{
			authenticatedUser: testUser,
			shouldFail:        false,
		}

		body, _ := json.Marshal(Credentials{Username: "jdoe", Password: "validpassword"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
		rr := httptest.NewRecorder()

		handleLogin(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", rr.Code, rr.Body.String())
		}

		// Verify auth_token cookie
		cookies := rr.Result().Cookies()
		var authCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "auth_token" {
				authCookie = c
				break
			}
		}

		if authCookie == nil {
			t.Fatalf("Expected auth_token cookie to be set")
		}
		if !authCookie.HttpOnly {
			t.Errorf("Expected auth_token cookie to be HttpOnly")
		}

		// Verify helper extracts same UserID from request with this cookie
		reqMe := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
		reqMe.AddCookie(authCookie)
		extractedID := getAuthenticatedUserID(reqMe)
		if extractedID != testUserID.String() {
			t.Errorf("Expected extracted user ID %s, got %s", testUserID.String(), extractedID)
		}
	})

	t.Run("Login - Invalid Credentials", func(t *testing.T) {
		DefaultAuthenticator = &mockAuthenticator{
			shouldFail: true,
		}

		body, _ := json.Marshal(Credentials{Username: "jdoe", Password: "badpassword"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
		rr := httptest.NewRecorder()

		handleLogin(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized, got %d", rr.Code)
		}
	})

	t.Run("Logout - Clears Cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
		rr := httptest.NewRecorder()

		handleLogout(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", rr.Code)
		}

		cookies := rr.Result().Cookies()
		var authCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "auth_token" {
				authCookie = c
				break
			}
		}

		if authCookie == nil || authCookie.Value != "" {
			t.Errorf("Expected empty auth_token cookie on logout")
		}
	})

	t.Run("Change Password - Unauthorized without Cookie", func(t *testing.T) {
		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: "oldpassword",
			NewPassword:     "newpassword123",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/change_password", bytes.NewReader(body))
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized, got %d", rr.Code)
		}
	})

	t.Run("Change Password - Too Short", func(t *testing.T) {
		// Log in first to get cookie
		DefaultAuthenticator = &mockAuthenticator{authenticatedUser: testUser, shouldFail: false}
		loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader([]byte(`{"username":"jdoe","password":"pw"}`)))
		loginRr := httptest.NewRecorder()
		handleLogin(loginRr, loginReq)

		var cookie *http.Cookie
		for _, c := range loginRr.Result().Cookies() {
			if c.Name == "auth_token" {
				cookie = c
				break
			}
		}

		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: "oldpassword",
			NewPassword:     "12345", // < 6 chars
		})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/change_password", bytes.NewReader(body))
		req.AddCookie(cookie)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request, got %d", rr.Code)
		}
	})
}

func TestAuthMiddleware(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	wrapped := AuthMiddleware(dummyHandler)

	t.Run("Public routes pass without auth token", func(t *testing.T) {
		publicPaths := []string{
			"/api/system/version",
			"/api/sse",
			"/api/sales_orders",
			"/api/machines",
			"/api/defects/project_summary",
			"/api/defects/summary",
			"/api/defects/machine_summary",
			"/api/defects/project_department_summary",
			"/display",
			"/index.html",
		}

		for _, p := range publicPaths {
			req := httptest.NewRequest(http.MethodGet, p, nil)
			rr := httptest.NewRecorder()
			wrapped.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("Path %s expected 200 OK, got %d", p, rr.Code)
			}
		}
	})

	t.Run("Protected routes require auth token", func(t *testing.T) {
		protectedCases := []struct {
			method string
			path   string
		}{
			{http.MethodGet, "/api/users"},
			{http.MethodGet, "/api/logs"},
			{http.MethodPost, "/api/sales_orders"},
			{http.MethodPost, "/api/machines"},
			{http.MethodPut, "/api/machines/123"},
			{http.MethodPost, "/api/machines/123/defects"},
		}

		for _, tc := range protectedCases {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rr := httptest.NewRecorder()
			wrapped.ServeHTTP(rr, req)

			if rr.Code != http.StatusUnauthorized {
				t.Errorf("%s %s expected 401 Unauthorized, got %d", tc.method, tc.path, rr.Code)
			}
		}
	})

	t.Run("Public route with invalid token still passes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines", nil)
		req.AddCookie(&http.Cookie{Name: "auth_token", Value: "invalid-garbage-token"})
		rr := httptest.NewRecorder()
		wrapped.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected public route with invalid cookie to pass with 200, got %d", rr.Code)
		}
	})

	t.Run("Protected route with invalid token fails with 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
		req.AddCookie(&http.Cookie{Name: "auth_token", Value: "invalid-garbage-token"})
		rr := httptest.NewRecorder()
		wrapped.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected protected route with invalid cookie to return 401, got %d", rr.Code)
		}
	})
}
