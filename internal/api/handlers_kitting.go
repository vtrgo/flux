package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetKitting gets all parts for a machine
func handleGetKitting(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, department, part_number, description, qty_required, qty_picked, status, fulfilled_at, fulfilled_by
		FROM kitting_parts
		WHERE machine_id = $1
		ORDER BY part_number ASC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	parts := []models.KittingPart{}
	for rows.Next() {
		var p models.KittingPart
		if err := rows.Scan(
			&p.ID, &p.MachineID, &p.Department, &p.PartNumber, &p.Description,
			&p.QtyRequired, &p.QtyPicked, &p.Status, &p.FulfilledAt, &p.FulfilledBy,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row", nil)
			return
		}
		parts = append(parts, p)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, parts)
}

// handleGetAllKitting fetches all kitting parts across all active machines
func handleGetAllKitting(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT k.id, k.machine_id, m.order_number, k.department, k.part_number, k.description, k.qty_required, k.qty_picked, k.status, k.fulfilled_at, k.fulfilled_by
		FROM kitting_parts k
		JOIN machines m ON k.machine_id = m.id
		WHERE m.status != 'shipped'
		ORDER BY k.status DESC, m.created_at DESC
	`)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	type KittingWithMachine struct {
		models.KittingPart
		OrderNumber string `json:"order_number"`
	}

	parts := []KittingWithMachine{}
	for rows.Next() {
		var p KittingWithMachine
		if err := rows.Scan(
			&p.ID, &p.MachineID, &p.OrderNumber, &p.Department, &p.PartNumber, &p.Description,
			&p.QtyRequired, &p.QtyPicked, &p.Status, &p.FulfilledAt, &p.FulfilledBy,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning part: ", err)
			return
		}
		parts = append(parts, p)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, parts)
}

// handleAddKittingPart adds a part to a machine's BOM
func handleAddKittingPart(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		Department  string `json:"department"`
		PartNumber  string `json:"part_number"`
		Description string `json:"description"`
		QtyRequired int    `json:"qty_required"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var newPart models.KittingPart
	err := db.DB.QueryRow(`
		INSERT INTO kitting_parts (machine_id, department, part_number, description, qty_required)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, machine_id, department, part_number, description, qty_required, qty_picked, status
	`, machineID, req.Department, req.PartNumber, req.Description, req.QtyRequired).Scan(
		&newPart.ID, &newPart.MachineID, &newPart.Department, &newPart.PartNumber,
		&newPart.Description, &newPart.QtyRequired, &newPart.QtyPicked, &newPart.Status,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert part: ", err)
		return
	}

	BroadcastEvent("kitting_part_added", newPart)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusCreated, newPart)
}

// handleUpdateKittingPart marks a part as fulfilled
func handleUpdateKittingPart(w http.ResponseWriter, r *http.Request) {
	partID := r.PathValue("part_id")
	if partID == "" {
		respondError(w, http.StatusBadRequest, "Part ID is required", nil)
		return
	}

	var req struct {
		QtyPicked int `json:"qty_picked"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updatedPart models.KittingPart
	err := db.DB.QueryRow(`
		UPDATE kitting_parts 
		SET 
			qty_picked = $2, 
			status = CASE WHEN $2 >= qty_required THEN 'fulfilled' ELSE 'partial' END,
			fulfilled_at = CASE WHEN $2 >= qty_required THEN NOW() ELSE NULL END, 
			fulfilled_by = CASE WHEN $2 >= qty_required THEN 'user_kitting_01' ELSE NULL END
		WHERE id = $1
		RETURNING id, machine_id, department, part_number, description, qty_required, qty_picked, status, fulfilled_at, fulfilled_by
	`, partID, req.QtyPicked).Scan(
		&updatedPart.ID, &updatedPart.MachineID, &updatedPart.Department, &updatedPart.PartNumber,
		&updatedPart.Description, &updatedPart.QtyRequired, &updatedPart.QtyPicked, &updatedPart.Status,
		&updatedPart.FulfilledAt, &updatedPart.FulfilledBy,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update part: ", err)
		return
	}

	// This is the communications hub: Broadcast the update so Assembly knows immediately!
	BroadcastEvent("kitting_part_updated", updatedPart)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updatedPart)
}
