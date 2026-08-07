package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetAllMachineShopTasks fetches all machine shop tasks
func handleGetAllMachineShopTasks(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT id, machine_id, defect_id, part_name, material, status, machined_by, completed_at, created_at
		FROM machine_shop_tasks
		ORDER BY status DESC, created_at DESC
	`)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tasks := []models.MachineShopTask{}
	for rows.Next() {
		var t models.MachineShopTask
		if err := rows.Scan(
			&t.ID, &t.MachineID, &t.DefectID, &t.PartName, &t.Material, 
			&t.Status, &t.MachinedBy, &t.CompletedAt, &t.CreatedAt,
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

// handleAddMachineShopTask creates a new machine shop task
func handleAddMachineShopTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MachineID string  `json:"machine_id"`
		DefectID  *string `json:"defect_id"`
		PartName  string  `json:"part_name"`
		Material  string  `json:"material"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var newTask models.MachineShopTask
	err := db.DB.QueryRow(`
		INSERT INTO machine_shop_tasks (machine_id, defect_id, part_name, material, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING id, machine_id, defect_id, part_name, material, status, created_at
	`, req.MachineID, req.DefectID, req.PartName, req.Material).Scan(
		&newTask.ID, &newTask.MachineID, &newTask.DefectID, &newTask.PartName, 
		&newTask.Material, &newTask.Status, &newTask.CreatedAt,
	)

	if err != nil {
		http.Error(w, "Failed to create task: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("machine_shop_task_added", newTask)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newTask)
}

// handleUpdateMachineShopTask updates task status
func handleUpdateMachineShopTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("task_id")
	if taskID == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Status string `json:"status"` // 'machining' or 'complete'
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var updatedTask models.MachineShopTask
	err := db.DB.QueryRow(`
		UPDATE machine_shop_tasks 
		SET status = $2, 
		    completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END,
		    machined_by = CASE WHEN $2 = 'complete' THEN 'user_machinist_01' ELSE machined_by END
		WHERE id = $1
		RETURNING id, machine_id, defect_id, part_name, material, status, machined_by, completed_at, created_at
	`, taskID, req.Status).Scan(
		&updatedTask.ID, &updatedTask.MachineID, &updatedTask.DefectID, &updatedTask.PartName, 
		&updatedTask.Material, &updatedTask.Status, &updatedTask.MachinedBy, 
		&updatedTask.CompletedAt, &updatedTask.CreatedAt,
	)

	if err != nil {
		http.Error(w, "Failed to update task: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("machine_shop_task_updated", updatedTask)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(updatedTask)
}
