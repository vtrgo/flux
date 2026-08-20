package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
)

type Attachment struct {
	ID        string           `json:"id"`
	IssueID   string           `json:"issue_id"`
	Filename  string           `json:"filename"`
	MimeType  string           `json:"mime_type"`
	ByteSize  int64            `json:"byte_size"`
	Metadata  *json.RawMessage `json:"metadata,omitempty"`
	CreatedAt time.Time        `json:"created_at"`
}

func handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	issueID := r.PathValue("issue_id")
	if issueID == "" {
		respondError(w, http.StatusBadRequest, "Missing issue_id", nil)
		return
	}

	err := r.ParseMultipartForm(10 << 20) // 10 MB max memory
	if err != nil {
		respondError(w, http.StatusBadRequest, "Unable to parse form", err)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Missing file payload", err)
		return
	}
	defer file.Close()

	// Validate MIME type
	mimeType := header.Header.Get("Content-Type")
	if mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp" {
		respondError(w, http.StatusBadRequest, "Invalid file type. Only JPEG, PNG, and WebP are allowed", nil)
		return
	}

	attachmentID := uuid.New().String()
	ext := filepath.Ext(header.Filename)
	filename := attachmentID + ext

	storageDir := os.Getenv("ATTACHMENTS_DIR")
	if storageDir == "" {
		storageDir = "data/attachments"
	}
	issueDir := filepath.Join(storageDir, issueID)

	if err := os.MkdirAll(issueDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create storage directory", err)
		return
	}

	filePath := filepath.Join(issueDir, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to save file", err)
		return
	}
	defer dst.Close()

	byteSize, err := io.Copy(dst, file)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to write file", err)
		return
	}

	query := `
		INSERT INTO attachments (id, issue_id, filename, mime_type, byte_size)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at
	`
	var createdAt time.Time
	err = db.DB.QueryRow(
		query,
		attachmentID,
		issueID,
		header.Filename,
		mimeType,
		byteSize,
	).Scan(&createdAt)
	if err != nil {
		os.Remove(filePath) // Cleanup on failure
		respondError(w, http.StatusInternalServerError, "Failed to save attachment metadata", err)
		return
	}

	att := Attachment{
		ID:        attachmentID,
		IssueID:   issueID,
		Filename:  header.Filename,
		MimeType:  mimeType,
		ByteSize:  byteSize,
		CreatedAt: createdAt,
	}

	slog.Debug("Attachment successfully uploaded", 
		"attachment_id", attachmentID, 
		"issue_id", issueID, 
		"filename", header.Filename, 
		"size_bytes", byteSize,
	)

	BroadcastEvent("attachment_added", map[string]string{
		"issue_id": issueID,
		"attachment_id": attachmentID,
	})

	respondJSON(w, http.StatusCreated, att)
}

func handleServeAttachment(w http.ResponseWriter, r *http.Request) {
	attachmentID := r.PathValue("attachment_id")
	if attachmentID == "" {
		respondError(w, http.StatusBadRequest, "Missing attachment_id", nil)
		return
	}

	var issueID, originalFilename string
	err := db.DB.QueryRow("SELECT issue_id, filename FROM attachments WHERE id = $1", attachmentID).Scan(&issueID, &originalFilename)
	if err != nil {
		respondError(w, http.StatusNotFound, "Attachment not found", err)
		return
	}

	ext := filepath.Ext(originalFilename)
	filename := attachmentID + ext

	storageDir := os.Getenv("ATTACHMENTS_DIR")
	if storageDir == "" {
		storageDir = "data/attachments"
	}
	filePath := filepath.Join(storageDir, issueID, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		slog.Warn("Attachment metadata exists but file is missing from disk", "attachment_id", attachmentID, "file_path", filePath)
		respondError(w, http.StatusNotFound, "File not found on disk", nil)
		return
	}

	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	http.ServeFile(w, r, filePath)
}

func handleListIssueAttachments(w http.ResponseWriter, r *http.Request) {
	issueID := r.PathValue("issue_id")
	if issueID == "" {
		respondError(w, http.StatusBadRequest, "Missing issue_id", nil)
		return
	}

	rows, err := db.DB.Query("SELECT id, issue_id, filename, mime_type, byte_size, metadata, created_at FROM attachments WHERE issue_id = $1 ORDER BY created_at DESC", issueID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch attachments", err)
		return
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.IssueID, &a.Filename, &a.MimeType, &a.ByteSize, &a.Metadata, &a.CreatedAt); err != nil {
			continue
		}
		attachments = append(attachments, a)
	}

	respondJSON(w, http.StatusOK, attachments)
}

func handleDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	attachmentID := r.PathValue("id")
	if attachmentID == "" {
		respondError(w, http.StatusBadRequest, "Attachment ID is required", nil)
		return
	}

	var issueID, originalFilename string
	err := db.DB.QueryRow("SELECT issue_id, filename FROM attachments WHERE id = $1", attachmentID).Scan(&issueID, &originalFilename)
	if err != nil {
		respondError(w, http.StatusNotFound, "Attachment not found", err)
		return
	}

	// Delete from DB
	_, err = db.DB.Exec("DELETE FROM attachments WHERE id = $1", attachmentID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete attachment record", err)
		return
	}

	// Clean up physical file
	ext := filepath.Ext(originalFilename)
	filename := attachmentID + ext

	storageDir := os.Getenv("ATTACHMENTS_DIR")
	if storageDir == "" {
		storageDir = "data/attachments"
	}
	filePath := filepath.Join(storageDir, issueID, filename)

	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		slog.Error("Failed to delete physical attachment file", "attachment_id", attachmentID, "file_path", filePath, "error", err)
	} else {
		slog.Debug("Attachment successfully deleted", "attachment_id", attachmentID, "issue_id", issueID)
	}

	BroadcastEvent("attachment_deleted", map[string]string{
		"issue_id": issueID,
		"attachment_id": attachmentID,
	})

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusNoContent)
}
