package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	user, err := DefaultAuthenticator.Authenticate(r.Context(), creds.Username, creds.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) || errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusUnauthorized, "Invalid username or password", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Authentication error", err)
		return
	}

	// Credentials valid, generate session token
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: user.ID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(GetJWTSecret())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not generate token", err)
		return
	}

	// We set an HttpOnly cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})

	slog.Info("User logged in", "user_id", user.ID, "username", user.Username, "auth_provider", user.AuthProvider)
	respondJSON(w, http.StatusOK, user)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
		Path:     "/",
	})
	respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
}

func handleGetMe(w http.ResponseWriter, r *http.Request) {
	userID := getAuthenticatedUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	var user models.User
	err := db.DB.QueryRow(`
		SELECT id, username, first_name, last_name, department, role, auth_provider, external_id, created_at
		FROM users WHERE id = $1
	`, userID).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Department, &user.Role,
		&user.AuthProvider, &user.ExternalID, &user.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not fetch user", err)
		return
	}

	respondJSON(w, http.StatusOK, user)
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := getAuthenticatedUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.NewPassword == "" {
		respondError(w, http.StatusBadRequest, "New password cannot be empty", nil)
		return
	}

	if len(req.NewPassword) < 6 {
		respondError(w, http.StatusBadRequest, "New password must be at least 6 characters", nil)
		return
	}

	// Fetch current password hash and auth_provider
	var currentHash sql.NullString
	var authProvider string
	err := db.DB.QueryRow(`
		SELECT password_hash, auth_provider
		FROM users WHERE id = $1
	`, userID).Scan(&currentHash, &authProvider)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	if authProvider != "local" {
		respondError(w, http.StatusBadRequest, "Password management is not available for external corporate accounts", nil)
		return
	}

	// If current password hash exists, verify the user's current password
	if currentHash.Valid && currentHash.String != "" {
		if req.CurrentPassword == "" {
			respondError(w, http.StatusBadRequest, "Current password is required", nil)
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(currentHash.String), []byte(req.CurrentPassword)); err != nil {
			respondError(w, http.StatusUnauthorized, "Current password does not match", nil)
			return
		}
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to hash password", err)
		return
	}

	_, err = db.DB.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, string(newHash), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update password", err)
		return
	}

	slog.Info("User updated password successfully", "user_id", userID)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

// getAuthenticatedUserID is a helper that parses the JWT token from cookies
func getAuthenticatedUserID(r *http.Request) string {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return ""
	}

	tokenStr := cookie.Value
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return GetJWTSecret(), nil
	})

	if err != nil || !token.Valid {
		return ""
	}

	return claims.UserID
}
