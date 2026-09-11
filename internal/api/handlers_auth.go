package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"

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
