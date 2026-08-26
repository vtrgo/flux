package api

import (
	"net/http"

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
