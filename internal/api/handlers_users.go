package api

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"golang.org/x/crypto/bcrypt"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetUsers fetches all active users, optionally filtered by department
func handleGetUsers(w http.ResponseWriter, r *http.Request) {
	deptFilter := r.URL.Query().Get("department")

	var rows *sql.Rows
	var err error

	if deptFilter != "" {
		rows, err = db.DB.Query(`
			SELECT id, username, email, first_name, last_name, department, role, auth_provider, external_id, created_at
			FROM users
			WHERE LOWER(department) = LOWER($1)
			ORDER BY username ASC
		`, deptFilter)
	} else {
		rows, err = db.DB.Query(`
			SELECT id, username, email, first_name, last_name, department, role, auth_provider, external_id, created_at
			FROM users
			ORDER BY username ASC
		`)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Email, &u.FirstName, &u.LastName, &u.Department, &u.Role, &u.AuthProvider, &u.ExternalID, &u.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning user: ", err)
			return
		}
		users = append(users, u)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, users)
}

// handleCreateUser adds a new user to the system
func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username     string  `json:"username"`
		Email        *string `json:"email"`
		FirstName    string  `json:"first_name"`
		LastName     string  `json:"last_name"`
		Department   string  `json:"department"`
		Role         string  `json:"role"`
		AuthProvider *string `json:"auth_provider"`
		ExternalID   *string `json:"external_id"`
		Password     string  `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var passwordHash *string
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to hash password", err)
			return
		}
		hashStr := string(hash)
		passwordHash = &hashStr
	}

	authProvider := "local"
	if req.AuthProvider != nil && *req.AuthProvider != "" {
		authProvider = *req.AuthProvider
	}

	var newUser models.User
	err := db.DB.QueryRow(`
		INSERT INTO users (username, email, first_name, last_name, department, role, auth_provider, external_id, password_hash)
		VALUES (NULLIF($1, ''), NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, NULLIF($8, ''), $9)
		RETURNING id, username, email, first_name, last_name, department, role, auth_provider, external_id, created_at
	`, req.Username, req.Email, req.FirstName, req.LastName, req.Department, req.Role, authProvider, req.ExternalID, passwordHash).Scan(
		&newUser.ID, &newUser.Username, &newUser.Email, &newUser.FirstName, &newUser.LastName, &newUser.Department, &newUser.Role, &newUser.AuthProvider, &newUser.ExternalID, &newUser.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create user: ", err)
		return
	}

	slog.Debug("User created", "user_id", newUser.ID)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusCreated, newUser)
}

// handleUpdateUser updates an existing user
func handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "User ID is required", nil)
		return
	}

	var req struct {
		Username     string  `json:"username"`
		Email        *string `json:"email"`
		FirstName    string  `json:"first_name"`
		LastName     string  `json:"last_name"`
		Department   string  `json:"department"`
		Role         string  `json:"role"`
		AuthProvider *string `json:"auth_provider"`
		ExternalID   *string `json:"external_id"`
		Password     string  `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var err error
	if req.Password != "" {
		var hash []byte
		hash, err = bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to hash password", err)
			return
		}
		
		_, err = db.DB.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, string(hash), userID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to update password", err)
			return
		}
	}

	var updatedUser models.User
	err = db.DB.QueryRow(`
		UPDATE users
		SET username = NULLIF($2, ''), 
		    email = NULLIF($3, ''),
		    first_name = NULLIF($4, ''), 
		    last_name = NULLIF($5, ''), 
		    department = NULLIF($6, ''), 
		    role = NULLIF($7, ''),
		    auth_provider = COALESCE(NULLIF($8, ''), auth_provider),
		    external_id = COALESCE(NULLIF($9, ''), external_id)
		WHERE id = $1
		RETURNING id, username, email, first_name, last_name, department, role, auth_provider, external_id, created_at
	`, userID, req.Username, req.Email, req.FirstName, req.LastName, req.Department, req.Role, req.AuthProvider, req.ExternalID).Scan(
		&updatedUser.ID, &updatedUser.Username, &updatedUser.Email, &updatedUser.FirstName, &updatedUser.LastName, &updatedUser.Department, &updatedUser.Role, &updatedUser.AuthProvider, &updatedUser.ExternalID, &updatedUser.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update user: ", err)
		return
	}

	slog.Debug("User updated", "user_id", userID)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedUser)
}

// handleDeleteUser deletes a user
func handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "User ID is required", nil)
		return
	}

	_, err := db.DB.Exec("DELETE FROM users WHERE id = $1", userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete user", err)
		return
	}

	slog.Debug("User deleted", "user_id", userID)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusNoContent)
}
