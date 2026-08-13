package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetControls gets all checkpoints for a machine
func handleGetControls(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, checkpoint_type, description, expected_value, actual_value, status, signed_off_by, signed_off_at
		FROM controls_checkpoints
		WHERE machine_id = $1
		ORDER BY status ASC, checkpoint_type ASC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	checkpoints := []models.ControlsCheckpoint{}
	for rows.Next() {
		var c models.ControlsCheckpoint
		if err := rows.Scan(
			&c.ID, &c.MachineID, &c.CheckpointType, &c.Description,
			&c.ExpectedValue, &c.ActualValue, &c.Status, &c.SignedOffBy, &c.SignedOffAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row: ", err)
			return
		}
		checkpoints = append(checkpoints, c)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, checkpoints)
}

// handleGetAllControls fetches all controls checkpoints across all active machines
func handleGetAllControls(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT c.id, c.machine_id, m.order_number, c.checkpoint_type, c.description, c.expected_value, c.actual_value, c.status, c.signed_off_by, c.signed_off_at
		FROM controls_checkpoints c
		JOIN machines m ON c.machine_id = m.id
		WHERE m.status != 'shipped'
		ORDER BY c.status DESC, m.created_at DESC
	`)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	type ControlsWithMachine struct {
		models.ControlsCheckpoint
		OrderNumber string `json:"order_number"`
	}

	checks := []ControlsWithMachine{}
	for rows.Next() {
		var c ControlsWithMachine
		if err := rows.Scan(
			&c.ID, &c.MachineID, &c.OrderNumber, &c.CheckpointType, &c.Description,
			&c.ExpectedValue, &c.ActualValue, &c.Status, &c.SignedOffBy, &c.SignedOffAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning checkpoint: ", err)
			return
		}
		checks = append(checks, c)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, checks)
}

// handleAddControlsCheckpoint adds a controls checkpoint for a machine
func handleAddControlsCheckpoint(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		CheckpointType string  `json:"checkpoint_type"`
		Description    string  `json:"description"`
		ExpectedValue  *string `json:"expected_value"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var newCheckpoint models.ControlsCheckpoint
	err := db.DB.QueryRow(`
		INSERT INTO controls_checkpoints (machine_id, checkpoint_type, description, expected_value)
		VALUES ($1, $2, $3, $4)
		RETURNING id, machine_id, checkpoint_type, description, expected_value, actual_value, status
	`, machineID, req.CheckpointType, req.Description, req.ExpectedValue).Scan(
		&newCheckpoint.ID, &newCheckpoint.MachineID, &newCheckpoint.CheckpointType,
		&newCheckpoint.Description, &newCheckpoint.ExpectedValue, &newCheckpoint.ActualValue, &newCheckpoint.Status,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert checkpoint: ", err)
		return
	}

	BroadcastEvent("controls_checkpoint_added", newCheckpoint)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	respondJSON(w, http.StatusOK, newCheckpoint)
}

// handleUpdateControlsCheckpoint marks a checkpoint as passed and records the actual value
func handleUpdateControlsCheckpoint(w http.ResponseWriter, r *http.Request) {
	checkID := r.PathValue("check_id")
	if checkID == "" {
		respondError(w, http.StatusBadRequest, "Check ID is required", nil)
		return
	}

	var req struct {
		ActualValue string `json:"actual_value"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updatedCheck models.ControlsCheckpoint
	err := db.DB.QueryRow(`
		UPDATE controls_checkpoints 
		SET status = 'pass', actual_value = $2, signed_off_at = NOW(), signed_off_by = 'user_controls_01'
		WHERE id = $1
		RETURNING id, machine_id, checkpoint_type, description, expected_value, actual_value, status, signed_off_by, signed_off_at
	`, checkID, req.ActualValue).Scan(
		&updatedCheck.ID, &updatedCheck.MachineID, &updatedCheck.CheckpointType, &updatedCheck.Description,
		&updatedCheck.ExpectedValue, &updatedCheck.ActualValue, &updatedCheck.Status,
		&updatedCheck.SignedOffBy, &updatedCheck.SignedOffAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update checkpoint: ", err)
		return
	}

	BroadcastEvent("controls_checkpoint_updated", updatedCheck)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedCheck)
}
