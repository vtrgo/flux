package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"golang.org/x/crypto/bcrypt"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetUsers fetches all active users
func handleGetUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT id, username, first_name, last_name, department, role, created_at
		FROM users
		ORDER BY username ASC
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Department, &u.Role, &u.CreatedAt,
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
		Username   string `json:"username"`
		FirstName  string `json:"first_name"`
		LastName   string `json:"last_name"`
		Department string `json:"department"`
		Role       string `json:"role"`
		Password   string `json:"password"`
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

	var newUser models.User
	err := db.DB.QueryRow(`
		INSERT INTO users (username, first_name, last_name, department, role, password_hash)
		VALUES (NULLIF($1, ''), NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6)
		RETURNING id, username, first_name, last_name, department, role, created_at
	`, req.Username, req.FirstName, req.LastName, req.Department, req.Role, passwordHash).Scan(
		&newUser.ID, &newUser.Username, &newUser.FirstName, &newUser.LastName, &newUser.Department, &newUser.Role, &newUser.CreatedAt,
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
		Username   string `json:"username"`
		FirstName  string `json:"first_name"`
		LastName   string `json:"last_name"`
		Department string `json:"department"`
		Role       string `json:"role"`
		Password   string `json:"password"`
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
		    first_name = NULLIF($3, ''), 
		    last_name = NULLIF($4, ''), 
		    department = NULLIF($5, ''), 
		    role = NULLIF($6, '')
		WHERE id = $1
		RETURNING id, username, first_name, last_name, department, role, created_at
	`, userID, req.Username, req.FirstName, req.LastName, req.Department, req.Role).Scan(
		&updatedUser.ID, &updatedUser.Username, &updatedUser.FirstName, &updatedUser.LastName, &updatedUser.Department, &updatedUser.Role, &updatedUser.CreatedAt,
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
