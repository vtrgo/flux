package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetAllLaserTasks fetches all machine shop tasks
func handleGetAllLaserTasks(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT id, machine_id, defect_id, part_name, material, status, cut_by, completed_at, created_at
		FROM laser_tasks
		ORDER BY status DESC, created_at DESC
	`)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	tasks := []models.LaserTask{}
	for rows.Next() {
		var t models.LaserTask
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.DefectID, &t.PartName, &t.Material,
			&t.Status, &t.CutBy, &t.CompletedAt, &t.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning task: ", err)
			return
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, tasks)
}

// handleAddLaserTask creates a new machine shop task
func handleAddLaserTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MachineID string  `json:"machine_id"`
		DefectID  *string `json:"defect_id"`
		PartName  string  `json:"part_name"`
		Material  string  `json:"material"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var newTask models.LaserTask
	err := db.DB.QueryRow(`
		INSERT INTO laser_tasks (machine_id, defect_id, part_name, material, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING id, machine_id, defect_id, part_name, material, status, created_at
	`, req.MachineID, req.DefectID, req.PartName, req.Material).Scan(
		&newTask.ID, &newTask.MachineID, &newTask.DefectID, &newTask.PartName,
		&newTask.Material, &newTask.Status, &newTask.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create task: ", err)
		return
	}

	BroadcastEvent("laser_task_added", newTask)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusCreated, newTask)
}

// handleUpdateLaserTask updates task status
func handleUpdateLaserTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("task_id")
	if taskID == "" {
		respondError(w, http.StatusBadRequest, "Task ID is required", nil)
		return
	}

	var req struct {
		Status string `json:"status"` // 'machining' or 'complete'
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updatedTask models.LaserTask
	err := db.DB.QueryRow(`
		UPDATE laser_tasks 
		SET status = $2, 
		    completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END,
		    cut_by = CASE WHEN $2 = 'complete' THEN 'user_machinist_01' ELSE cut_by END
		WHERE id = $1
		RETURNING id, machine_id, defect_id, part_name, material, status, cut_by, completed_at, created_at
	`, taskID, req.Status).Scan(
		&updatedTask.ID, &updatedTask.MachineID, &updatedTask.DefectID, &updatedTask.PartName,
		&updatedTask.Material, &updatedTask.Status, &updatedTask.CutBy,
		&updatedTask.CompletedAt, &updatedTask.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update task: ", err)
		return
	}

	BroadcastEvent("laser_task_updated", updatedTask)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedTask)
}
