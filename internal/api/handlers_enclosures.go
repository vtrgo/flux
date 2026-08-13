package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetEnclosures gets all tasks for a machine
func handleGetEnclosures(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, task_name, status, started_at, completed_at, signed_off_by, notes
		FROM enclosures_tasks
		WHERE machine_id = $1
		ORDER BY status ASC, task_name ASC
	`, machineID)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tasks := []models.EnclosuresTask{}
	for rows.Next() {
		var t models.EnclosuresTask
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.TaskName, &t.Status, 
			&t.StartedAt, &t.CompletedAt, &t.SignedOffBy, &t.Notes,
		); err != nil {
			http.Error(w, "Error scanning row", http.StatusInternalServerError)
			return
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(tasks)
}

// handleGetAllEnclosures fetches all enclosures tasks across all active machines
func handleGetAllEnclosures(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT e.id, e.machine_id, m.order_number, e.task_name, e.status, e.started_at, e.completed_at, e.signed_off_by, e.notes
		FROM enclosures_tasks e
		JOIN machines m ON e.machine_id = m.id
		WHERE m.status != 'shipped'
		ORDER BY e.status DESC, m.created_at DESC
	`)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type EnclosuresWithMachine struct {
		models.EnclosuresTask
		OrderNumber string `json:"order_number"`
	}

	tasks := []EnclosuresWithMachine{}
	for rows.Next() {
		var t EnclosuresWithMachine
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.OrderNumber, &t.TaskName, &t.Status, 
			&t.StartedAt, &t.CompletedAt, &t.SignedOffBy, &t.Notes,
		); err != nil {
			http.Error(w, "Error scanning task: "+err.Error(), http.StatusInternalServerError)
			return
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(tasks)
}

// handleAddEnclosuresTask adds an enclosures task for a machine
func handleAddEnclosuresTask(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		TaskName string `json:"task_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var newTask models.EnclosuresTask
	err := db.DB.QueryRow(`
		INSERT INTO enclosures_tasks (machine_id, task_name)
		VALUES ($1, $2)
		RETURNING id, machine_id, task_name, status
	`, machineID, req.TaskName).Scan(
		&newTask.ID, &newTask.MachineID, &newTask.TaskName, &newTask.Status,
	)

	if err != nil {
		http.Error(w, "Failed to insert task: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("enclosures_task_added", newTask)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newTask)
}

// handleUpdateEnclosuresTask marks an enclosures task as complete
func handleUpdateEnclosuresTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("task_id")
	if taskID == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Status string `json:"status"` // 'in_progress', 'complete'
		Notes  string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var updatedTask models.EnclosuresTask
	err := db.DB.QueryRow(`
		UPDATE enclosures_tasks 
		SET 
			status = $2,
			notes = CASE WHEN $3 != '' THEN $3 ELSE notes END,
			started_at = CASE WHEN $2 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
			completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END,
			signed_off_by = CASE WHEN $2 = 'complete' THEN 'user_enclosures_01' ELSE signed_off_by END
		WHERE id = $1
		RETURNING id, machine_id, task_name, status, started_at, completed_at, signed_off_by, notes
	`, taskID, req.Status, req.Notes).Scan(
		&updatedTask.ID, &updatedTask.MachineID, &updatedTask.TaskName, &updatedTask.Status, 
		&updatedTask.StartedAt, &updatedTask.CompletedAt, &updatedTask.SignedOffBy, &updatedTask.Notes,
	)

	if err != nil {
		http.Error(w, "Failed to update task: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("enclosures_task_updated", updatedTask)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(updatedTask)
}
