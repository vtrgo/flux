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
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, machine_id, document_type, version, file_url, status, uploaded_by, uploaded_at
		FROM design_documents
		WHERE machine_id = $1
		ORDER BY uploaded_at DESC
	`, machineID)
	
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
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
			http.Error(w, "Error scanning row: "+err.Error(), http.StatusInternalServerError)
			return
		}
		documents = append(documents, d)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(documents)
}

// handleAddDesignFeedback adds an engineering change request back to the design team
func handleAddDesignFeedback(w http.ResponseWriter, r *http.Request) {
	machineID := r.PathValue("id")
	if machineID == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		DocumentID       *string `json:"document_id"`
		SourceDepartment string  `json:"source_department"`
		FeedbackType     string  `json:"feedback_type"`
		Description      string  `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Failed to insert feedback: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("design_feedback_added", newFeedback)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newFeedback)
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
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
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
			http.Error(w, "Error scanning feedback: "+err.Error(), http.StatusInternalServerError)
			return
		}
		feedbacks = append(feedbacks, f)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(feedbacks)
}

// handleUpdateDesignFeedback allows design to mark feedback as reviewed
func handleUpdateDesignFeedback(w http.ResponseWriter, r *http.Request) {
	feedbackID := r.PathValue("feedback_id")
	if feedbackID == "" {
		http.Error(w, "Feedback ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Status string `json:"status"` // 'reviewed' or 'implemented'
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Failed to update feedback: "+err.Error(), http.StatusInternalServerError)
		return
	}

	BroadcastEvent("design_feedback_updated", updated)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(updated)
}
