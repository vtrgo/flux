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
}
