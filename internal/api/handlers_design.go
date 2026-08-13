package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetDesign gets all design documents and feedback for a machine
func handleGetDesign(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, document_type, version, file_url, status, uploaded_by, uploaded_at
		FROM design_documents
		WHERE machine_id = $1
		ORDER BY uploaded_at DESC
	`, machineID)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	documents := []models.DesignDocument{}
	for rows.Next() {
		var d models.DesignDocument
		if err := rows.Scan(
			&d.ID, &d.MachineID, &d.DocumentType, &d.Version, &d.FileURL,
			&d.Status, &d.UploadedBy, &d.UploadedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row: ", err)
			return
		}
		documents = append(documents, d)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, documents)
}

// handleAddDesignFeedback adds an engineering change request back to the design team
func handleAddDesignFeedback(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		DocumentID       *string `json:"document_id"`
		SourceDepartment string  `json:"source_department"`
		FeedbackType     string  `json:"feedback_type"`
		Description      string  `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var newFeedback models.DesignFeedback
	err := db.DB.QueryRow(`
		INSERT INTO design_feedback (machine_id, document_id, source_department, feedback_type, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, machine_id, document_id, source_department, feedback_type, description, status
	`, machineID, req.DocumentID, req.SourceDepartment, req.FeedbackType, req.Description).Scan(
		&newFeedback.ID, &newFeedback.MachineID, &newFeedback.DocumentID, &newFeedback.SourceDepartment,
		&newFeedback.FeedbackType, &newFeedback.Description, &newFeedback.Status,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert feedback: ", err)
		return
	}

	BroadcastEvent("design_feedback_added", newFeedback)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	respondJSON(w, http.StatusOK, newFeedback)
}

// handleGetAllDesignFeedback fetches all design feedback across all machines
func handleGetAllDesignFeedback(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT f.id, f.machine_id, m.order_number, f.document_id, f.source_department, f.feedback_type, f.description, f.status, f.reviewed_by, f.reviewed_at, f.created_at
		FROM design_feedback f
		JOIN machines m ON f.machine_id = m.id
		ORDER BY f.status ASC, f.created_at DESC
	`)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	type FeedbackWithMachine struct {
		models.DesignFeedback
		OrderNumber string `json:"order_number"`
	}

	feedbacks := []FeedbackWithMachine{}
	for rows.Next() {
		var f FeedbackWithMachine
		if err := rows.Scan(
			&f.ID, &f.MachineID, &f.OrderNumber, &f.DocumentID, &f.SourceDepartment,
			&f.FeedbackType, &f.Description, &f.Status, &f.ReviewedBy, &f.ReviewedAt, &f.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning feedback: ", err)
			return
		}
		feedbacks = append(feedbacks, f)
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, feedbacks)
}

// handleUpdateDesignFeedback allows design to mark feedback as reviewed
func handleUpdateDesignFeedback(w http.ResponseWriter, r *http.Request) {
	feedbackID := r.PathValue("feedback_id")
	if feedbackID == "" {
		respondError(w, http.StatusBadRequest, "Feedback ID is required", nil)
		return
	}

	var req struct {
		Status string `json:"status"` // 'reviewed' or 'implemented'
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var updated models.DesignFeedback
	err := db.DB.QueryRow(`
		UPDATE design_feedback 
		SET status = $2, reviewed_at = NOW(), reviewed_by = 'user_design_01'
		WHERE id = $1
		RETURNING id, machine_id, document_id, source_department, feedback_type, description, status, reviewed_by, reviewed_at, created_at
	`, feedbackID, req.Status).Scan(
		&updated.ID, &updated.MachineID, &updated.DocumentID, &updated.SourceDepartment,
		&updated.FeedbackType, &updated.Description, &updated.Status,
		&updated.ReviewedBy, &updated.ReviewedAt, &updated.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update feedback: ", err)
		return
	}

	BroadcastEvent("design_feedback_updated", updated)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	respondJSON(w, http.StatusOK, updated)
}
