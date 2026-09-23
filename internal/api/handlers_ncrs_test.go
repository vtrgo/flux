package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func TestNCRs(t *testing.T) {
	connStr := "host=/var/run/postgresql dbname=flux_test sslmode=disable"
	if err := db.InitDB(connStr); err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create test machine
	orderNum := fmt.Sprintf("M-NCR-TEST-%d", time.Now().UnixNano())
	var machineID uuid.UUID
	err := db.DB.QueryRow(`
		INSERT INTO machines (order_number, model_type, status)
		VALUES ($1, 'Test Model', 'assembly')
		RETURNING id
	`, orderNum).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to create test machine: %v", err)
	}

	defer func() {
		_, _ = db.DB.Exec("DELETE FROM defects WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
	}()

	t.Run("Get_Next_NCR_Number", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/ncrs/next-number", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp models.NextNCRNumberResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		year := time.Now().Format("2006")
		expectedPrefix := fmt.Sprintf("NCR-%s-", year)
		if len(resp.NextNumber) < len(expectedPrefix) || resp.NextNumber[:len(expectedPrefix)] != expectedPrefix {
			t.Errorf("expected NCR number starting with %s, got %s", expectedPrefix, resp.NextNumber)
		}
	})

	var createdNCRID uuid.UUID
	testNCRNum := fmt.Sprintf("NCR-%s-TEST-%d", time.Now().Format("2006"), time.Now().UnixNano()%10000)

	t.Run("Create_NCR_Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"machine_id":           machineID.String(),
			"ncr_number":           testNCRNum,
			"assembler":            "John Doe",
			"location":             "Station 3 - Main Track",
			"description":          "Weld alignment off by 2mm on rear support bracket",
			"severity":             "moderate",
			"source_department":    "quality",
			"assigned_department":  "assembly",
			"root_cause":           "Jig clamp slipped during tack welding",
			"corrective_action":    "Re-clamped with high-torque fixture and re-welded",
			"team_lead_signature":  "Mark Lead",
			"closeout_date":        time.Now().Format("2006-01-02"),
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/ncrs", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var ncr models.NCRDetail
		if err := json.NewDecoder(rr.Body).Decode(&ncr); err != nil {
			t.Fatalf("failed to decode created NCR: %v", err)
		}

		if !ncr.IsNCR {
			t.Errorf("expected is_ncr to be true")
		}
		if ncr.NCRNumber == nil || *ncr.NCRNumber != testNCRNum {
			t.Errorf("expected ncr_number %s, got %v", testNCRNum, ncr.NCRNumber)
		}
		if ncr.Assembler == nil || *ncr.Assembler != "John Doe" {
			t.Errorf("expected assembler 'John Doe', got %v", ncr.Assembler)
		}
		if ncr.Location == nil || *ncr.Location != "Station 3 - Main Track" {
			t.Errorf("expected location 'Station 3 - Main Track', got %v", ncr.Location)
		}
		if ncr.RootCause == nil || *ncr.RootCause != "Jig clamp slipped during tack welding" {
			t.Errorf("expected root cause, got %v", ncr.RootCause)
		}
		if ncr.OrderNumber != orderNum {
			t.Errorf("expected order_number %s, got %s", orderNum, ncr.OrderNumber)
		}

		createdNCRID = ncr.ID
	})

	t.Run("Get_NCRs_List_And_Search", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/ncrs?search=Station+3", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var ncrs []models.NCRDetail
		if err := json.NewDecoder(rr.Body).Decode(&ncrs); err != nil {
			t.Fatalf("failed to decode NCR list: %v", err)
		}

		found := false
		for _, item := range ncrs {
			if item.ID == createdNCRID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find created NCR in search results")
		}
	})

	t.Run("Update_NCR_Closeout", func(t *testing.T) {
		updatePayload := map[string]interface{}{
			"status":              "verified",
			"corrective_action":   "Verified 0.1mm tolerance with caliper",
			"team_lead_signature": "Alex Quality Lead",
		}

		body, _ := json.Marshal(updatePayload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/ncrs/%s", createdNCRID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var updated models.NCRDetail
		if err := json.NewDecoder(rr.Body).Decode(&updated); err != nil {
			t.Fatalf("failed to decode updated NCR: %v", err)
		}

		if updated.Status != "verified" {
			t.Errorf("expected status 'verified', got '%s'", updated.Status)
		}
		if updated.TeamLeadSignature == nil || *updated.TeamLeadSignature != "Alex Quality Lead" {
			t.Errorf("expected signature 'Alex Quality Lead', got %v", updated.TeamLeadSignature)
		}
	})

	t.Run("Create_NCR_Validation_Failures", func(t *testing.T) {
		// Missing machine_id
		body, _ := json.Marshal(map[string]string{"assembler": "Tester", "location": "Loc", "description": "Desc"})
		req := httptest.NewRequest(http.MethodPost, "/api/ncrs", bytes.NewReader(body))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for missing machine_id, got %d", rr.Code)
		}

		// Missing assembler
		body, _ = json.Marshal(map[string]string{"machine_id": machineID.String(), "location": "Loc", "description": "Desc"})
		req = httptest.NewRequest(http.MethodPost, "/api/ncrs", bytes.NewReader(body))
		rr = httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for missing assembler, got %d", rr.Code)
		}
	})

	t.Run("Upgrade_Issue_To_NCR", func(t *testing.T) {
		// 1. Create a regular defect (not an NCR)
		var oldDefectID uuid.UUID
		err := db.DB.QueryRow(`
			INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status, is_ncr)
			VALUES ($1, 'assembly', 'quality', 'Initial alignment issue to be upgraded', 'moderate', 'open', FALSE)
			RETURNING id
		`, machineID).Scan(&oldDefectID)
		if err != nil {
			t.Fatalf("failed to insert original defect: %v", err)
		}

		// 2. Insert an attachment linked to the old defect
		var attachmentID uuid.UUID
		err = db.DB.QueryRow(`
			INSERT INTO attachments (issue_id, filename, mime_type, byte_size)
			VALUES ($1, 'initial_photo.jpg', 'image/jpeg', 1024)
			RETURNING id
		`, oldDefectID).Scan(&attachmentID)
		if err != nil {
			t.Fatalf("failed to insert attachment: %v", err)
		}

		// 3. Insert a manager user to test responsible person routing
		var mgrID uuid.UUID
		err = db.DB.QueryRow(`
			INSERT INTO users (username, first_name, last_name, email, role, password_hash)
			VALUES ($1, 'Enda', 'McNamara', 'enda@vtrfeedersolutions.com', 'manager', 'hash')
			RETURNING id
		`, fmt.Sprintf("enda_mgr_%d", time.Now().UnixNano())).Scan(&mgrID)
		if err != nil {
			t.Fatalf("failed to insert test manager: %v", err)
		}
		defer func() {
			_, _ = db.DB.Exec("DELETE FROM users WHERE id = $1", mgrID)
		}()

		// 4. Post create NCR with upgrade_from_defect_id
		upgradePayload := map[string]interface{}{
			"machine_id":             machineID.String(),
			"assembler":              "Alex Technician",
			"location":               "Station 4 Track",
			"description":            "Upgraded non-conformance for track alignment",
			"severity":               "critical",
			"source_department":      "quality",
			"assigned_department":    "assembly",
			"assigned_user_id":       mgrID.String(),
			"root_cause":             "Root cause identified during review",
			"corrective_action":      "Corrective action scheduled",
			"team_lead_signature":    "Enda McNamara",
			"send_notification":      true,
			"upgrade_from_defect_id": oldDefectID.String(),
		}

		body, _ := json.Marshal(upgradePayload)
		req := httptest.NewRequest(http.MethodPost, "/api/ncrs", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var upgradedNCR models.NCRDetail
		if err := json.NewDecoder(rr.Body).Decode(&upgradedNCR); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if !upgradedNCR.IsNCR {
			t.Errorf("expected is_ncr to be true")
		}
		if upgradedNCR.NCRNumber == nil || *upgradedNCR.NCRNumber == "" {
			t.Errorf("expected generated NCR number")
		}
		if upgradedNCR.AssignedUserID == nil || *upgradedNCR.AssignedUserID != mgrID {
			t.Errorf("expected assigned_user_id to be %s, got %v", mgrID, upgradedNCR.AssignedUserID)
		}

		// 4. Verify old defect was removed
		var oldDefectCount int
		err = db.DB.QueryRow("SELECT count(*) FROM defects WHERE id = $1", oldDefectID).Scan(&oldDefectCount)
		if err != nil {
			t.Fatalf("failed to query old defect: %v", err)
		}
		if oldDefectCount != 0 {
			t.Errorf("expected old defect to be deleted, count was %d", oldDefectCount)
		}

		// 5. Verify attachment was migrated to new NCR ID
		var currentIssueID uuid.UUID
		err = db.DB.QueryRow("SELECT issue_id FROM attachments WHERE id = $1", attachmentID).Scan(&currentIssueID)
		if err != nil {
			t.Fatalf("failed to query attachment: %v", err)
		}
		if currentIssueID != upgradedNCR.ID {
			t.Errorf("expected attachment to be linked to new NCR %s, got %s", upgradedNCR.ID, currentIssueID)
		}
	})

	t.Run("Create_NCR_With_Signature_Fallback_Resolves_Manager", func(t *testing.T) {
		var testMgrID uuid.UUID
		err := db.DB.QueryRow(`
			INSERT INTO users (username, first_name, last_name, email, role, password_hash)
			VALUES ($1, 'Lucas', 'Sinclair', 'lucas_test@vtrfeedersolutions.com', 'manager', 'hash')
			RETURNING id
		`, fmt.Sprintf("lucas_mgr_%d", time.Now().UnixNano())).Scan(&testMgrID)
		if err != nil {
			t.Fatalf("failed to insert test manager: %v", err)
		}
		defer func() {
			_, _ = db.DB.Exec("DELETE FROM users WHERE id = $1", testMgrID)
		}()

		payload := map[string]interface{}{
			"machine_id":          machineID.String(),
			"ncr_number":          fmt.Sprintf("NCR-%s-SIG-%d", time.Now().Format("2006"), time.Now().UnixNano()),
			"assembler":           "Dave Tech",
			"location":            "Station 1",
			"description":         "Signature fallback notification test",
			"severity":            "minor",
			"source_department":   "quality",
			"assigned_department": "assembly",
			"team_lead_signature": "Lucas Sinclair",
			"send_notification":   true,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/ncrs", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var createdNCR models.NCRDetail
		if err := json.NewDecoder(rr.Body).Decode(&createdNCR); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if createdNCR.AssignedUserID == nil || *createdNCR.AssignedUserID != testMgrID {
			t.Errorf("expected assigned_user_id to fallback to %s, got %v", testMgrID, createdNCR.AssignedUserID)
		}
	})
}
