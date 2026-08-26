package api

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

var jwtKey = []byte("my_super_secret_key_vtr_flux_2026") // In production this should be in an env var

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

	var user models.User
	var passwordHash sql.NullString
	err := db.DB.QueryRow(`
		SELECT id, username, first_name, last_name, department, role, created_at, password_hash
		FROM users WHERE username = $1
	`, creds.Username).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Department, &user.Role, &user.CreatedAt, &passwordHash,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusUnauthorized, "Invalid username or password", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	// Check password
	if !passwordHash.Valid || passwordHash.String == "" {
		// No password set for this user yet
		respondError(w, http.StatusUnauthorized, "Invalid username or password", nil)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash.String), []byte(creds.Password)); err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid username or password", nil)
		return
	}

	// Password matched, create JWT
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: user.ID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
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

	slog.Info("User logged in", "user_id", user.ID)
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
		SELECT id, username, first_name, last_name, department, role, created_at
		FROM users WHERE id = $1
	`, userID).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Department, &user.Role, &user.CreatedAt,
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
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		return ""
	}

	return claims.UserID
}
