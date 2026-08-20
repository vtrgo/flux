package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"encoding/json"
)

func TestAttachments(t *testing.T) {
	// Need to initialize db and create a fake machine/defect first.
	// But we can just test the 404 / error cases if DB is not set up perfectly for integration,
	// or we can test it expecting a 400/404.
	
	t.Run("Serve_Attachment_-_Not_Found", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/attachments/00000000-0000-0000-0000-000000000000", nil)
		req.SetPathValue("attachment_id", "00000000-0000-0000-0000-000000000000")
		rr := httptest.NewRecorder()
		handleServeAttachment(rr, req)

		if rr.Code != http.StatusNotFound && rr.Code != http.StatusInternalServerError {
			t.Errorf("Expected 404 or 500, got %v", rr.Code)
		}
	})

	t.Run("Delete_Attachment_-_Not_Found", func(t *testing.T) {
		req, _ := http.NewRequest("DELETE", "/api/attachments/00000000-0000-0000-0000-000000000000", nil)
		req.SetPathValue("id", "00000000-0000-0000-0000-000000000000")
		rr := httptest.NewRecorder()
		handleDeleteAttachment(rr, req)

		if rr.Code != http.StatusNotFound && rr.Code != http.StatusInternalServerError {
			t.Errorf("Expected 404 or 500, got %v", rr.Code)
		}
	})

	t.Run("List_Attachments_-_Invalid_Issue", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/issues/00000000-0000-0000-0000-000000000000/attachments", nil)
		req.SetPathValue("issue_id", "00000000-0000-0000-0000-000000000000")
		rr := httptest.NewRecorder()
		handleListIssueAttachments(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected 200, got %v", rr.Code)
		}
		var result []interface{}
		_ = json.NewDecoder(rr.Body).Decode(&result)
		if len(result) != 0 {
			t.Errorf("Expected empty array, got %v", len(result))
		}
	})

	t.Run("Upload_Attachment_-_Invalid_Form", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/issues/00000000-0000-0000-0000-000000000000/attachments", nil)
		req.SetPathValue("issue_id", "00000000-0000-0000-0000-000000000000")
		rr := httptest.NewRecorder()
		handleUploadAttachment(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request, got %v", rr.Code)
		}
	})
}
