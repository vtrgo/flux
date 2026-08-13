package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetAssembly gets all tasks for a machine
func handleGetAssembly(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, task_name, status, started_at, completed_at, signed_off_by, notes
		FROM assembly_tasks
		WHERE machine_id = $1
		ORDER BY status ASC, task_name ASC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	tasks := []models.AssemblyTask{}
	for rows.Next() {
		var t models.AssemblyTask
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.TaskName, &t.Status,
			&t.StartedAt, &t.CompletedAt, &t.SignedOffBy, &t.Notes,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row", nil)
			return
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, tasks)
}

// handleGetAllAssembly fetches all assembly tasks across all active machines
func handleGetAllAssembly(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT a.id, a.machine_id, m.order_number, a.task_name, a.status, a.started_at, a.completed_at, a.signed_off_by, a.notes
		FROM assembly_tasks a
		JOIN machines m ON a.machine_id = m.id
		WHERE m.status != 'shipped'
		ORDER BY a.status DESC, m.created_at DESC
	`)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	type AssemblyWithMachine struct {
		models.AssemblyTask
		OrderNumber string `json:"order_number"`
	}

	tasks := []AssemblyWithMachine{}
	for rows.Next() {
		var t AssemblyWithMachine
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.OrderNumber, &t.TaskName, &t.Status,
			&t.StartedAt, &t.CompletedAt, &t.SignedOffBy, &t.Notes,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning task: ", err)
			return
		}
		tasks = append(tasks, t)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, tasks)
}

// handleAddAssemblyTask adds an assembly task for a machine
func handleAddAssemblyTask(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		TaskName string `json:"task_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var newTask models.AssemblyTask
	err := db.DB.QueryRow(`
		INSERT INTO assembly_tasks (machine_id, task_name)
		VALUES ($1, $2)
		RETURNING id, machine_id, task_name, status
	`, machineID, req.TaskName).Scan(
		&newTask.ID, &newTask.MachineID, &newTask.TaskName, &newTask.Status,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert task: ", err)
		return
	}

	BroadcastEvent("assembly_task_added", newTask)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	respondJSON(w, http.StatusOK, newTask)
}

// handleUpdateAssemblyTask marks an assembly task as complete
func handleUpdateAssemblyTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("task_id")
	if taskID == "" {
		respondError(w, http.StatusBadRequest, "Task ID is required", nil)
		return
	}

	var req struct {
		Status string `json:"status"` // 'in_progress', 'complete'
		Notes  string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updatedTask models.AssemblyTask
	err := db.DB.QueryRow(`
		UPDATE assembly_tasks 
		SET 
			status = $2,
			notes = CASE WHEN $3 != '' THEN $3 ELSE notes END,
			started_at = CASE WHEN $2 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
			completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END,
			signed_off_by = CASE WHEN $2 = 'complete' THEN 'user_assembly_01' ELSE signed_off_by END
		WHERE id = $1
		RETURNING id, machine_id, task_name, status, started_at, completed_at, signed_off_by, notes
	`, taskID, req.Status, req.Notes).Scan(
		&updatedTask.ID, &updatedTask.MachineID, &updatedTask.TaskName, &updatedTask.Status,
		&updatedTask.StartedAt, &updatedTask.CompletedAt, &updatedTask.SignedOffBy, &updatedTask.Notes,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update task: ", err)
		return
	}

	// Communications Hub: Let Quality know an assembly task is done
	BroadcastEvent("assembly_task_updated", updatedTask)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedTask)
}
