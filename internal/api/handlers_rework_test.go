package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func TestReworkHandlers(t *testing.T) {
	connStr := "host=/var/run/postgresql dbname=flux_test sslmode=disable"
	if err := db.InitDB(connStr); err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Create test sales order and machine
	var soID uuid.UUID
	poNum := fmt.Sprintf("PO-RW-TEST-%d", time.Now().UnixNano())
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, status)
		VALUES ('Test Customer', $1, 'PRJ-999', 'Cap Feeder', 'open')
		RETURNING id
	`, poNum).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to create test sales order: %v", err)
	}

	var machineID uuid.UUID
	orderNum := fmt.Sprintf("M-RW-TEST-%d", time.Now().UnixNano())
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, $2, 'Centrifugal Feeder', 'assembly')
		RETURNING id
	`, soID, orderNum).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to create test machine: %v", err)
	}

	// Create test defect
	var defectID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status)
		VALUES ($1, 'assembly', 'design', 'Bracket interference at chute', 'moderate', 'open')
		RETURNING id
	`, machineID).Scan(&defectID)
	if err != nil {
		t.Fatalf("failed to create test defect: %v", err)
	}

	defer func() {
		_, _ = db.DB.Exec("DELETE FROM rework_items WHERE sales_order_id = $1", soID)
		_, _ = db.DB.Exec("DELETE FROM controls_schematic_reworks WHERE sales_order_id = $1", soID)
		_, _ = db.DB.Exec("DELETE FROM defects WHERE machine_id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	}()

	var createdReworkID string

	t.Run("Create_Rework_Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"sales_order_id":    soID.String(),
			"machine_id":        machineID.String(),
			"defect_id":         defectID.String(),
			"project_number":    "999A",
			"sub_assembly":      "Sub-Assy 01 - Chute",
			"part_number":       "VTR-CH-001",
			"description":       "Escapement Chute Bracket",
			"revision":          "B",
			"material":          "6061-T6 Aluminum",
			"qty":               2,
			"part_type":         "MOD",
			"pdm_vault_released": true,
			"reason_for_rework": "Clearance issue during assembly alignment",
			"estimated_hours":   3.5,
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/rework/items", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var created models.ReworkItem
		if err := json.NewDecoder(rr.Body).Decode(&created); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		if created.PartNumber != "VTR-CH-001" || created.Revision != "B" {
			t.Errorf("unexpected part data: %+v", created)
		}
		if created.SalesOrderID != soID {
			t.Errorf("expected sales_order_id %v, got %v", soID, created.SalesOrderID)
		}

		// Verify audit note was appended to the linked defect
		var defNotes string
		_ = db.DB.QueryRow("SELECT COALESCE(notes, '') FROM defects WHERE id = $1", defectID).Scan(&defNotes)
		if !strings.Contains(defNotes, "[Escalated to Rework Order: VTR-CH-001]") {
			t.Errorf("expected defect notes to include escalation note, got: %s", defNotes)
		}

		createdReworkID = created.ID.String()
	})

	t.Run("Create_Rework_Missing_Required_Fields_Fails", func(t *testing.T) {
		payload := map[string]interface{}{
			"sales_order_id": soID.String(),
			"part_number":    "",
		}

		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/rework/items", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("Get_Rework_Items_List", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/rework/items?sales_order_id=%s", soID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var items []models.ReworkItem
		if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}

		if len(items) == 0 {
			t.Fatalf("expected at least 1 rework item")
		}
	})

	t.Run("Get_Rework_Item_By_ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/rework/items/"+createdReworkID, nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var item models.ReworkItem
		_ = json.NewDecoder(rr.Body).Decode(&item)
		if item.ID.String() != createdReworkID {
			t.Errorf("expected ID %s, got %s", createdReworkID, item.ID)
		}
	})

	t.Run("Update_Rework_Item_Progression", func(t *testing.T) {
		reqDate := "2026-10-25"
		updatePayload := map[string]interface{}{
			"requested_completion_date": reqDate,
			"status":                    "released_to_mfg",
			"pm_delivered_to":           "Dave Lead",
			"actual_hours":              4.0,
		}

		body, _ := json.Marshal(updatePayload)
		req := httptest.NewRequest(http.MethodPut, "/api/rework/items/"+createdReworkID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var updated models.ReworkItem
		_ = json.NewDecoder(rr.Body).Decode(&updated)
		if updated.Status != "released_to_mfg" {
			t.Errorf("expected status 'released_to_mfg', got '%s'", updated.Status)
		}
	})

	t.Run("After_Hours_Drop", func(t *testing.T) {
		dropPayload := map[string]interface{}{
			"part_given_to_or_left_at": "Manufacturing Desk Box A",
		}

		body, _ := json.Marshal(dropPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/rework/items/"+createdReworkID+"/after-hours-drop", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var dropped models.ReworkItem
		_ = json.NewDecoder(rr.Body).Decode(&dropped)
		if !dropped.IsAfterHoursDrop {
			t.Errorf("expected is_after_hours_drop to be true")
		}
	})

	t.Run("FAT_Readiness_Blocked_By_Active_Rework", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/fat-readiness", machineID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var readiness models.MachineFATReadinessResponse
		_ = json.NewDecoder(rr.Body).Decode(&readiness)
		if readiness.CanProceed {
			t.Errorf("expected FAT to be blocked when active rework exists")
		}
		if readiness.ActiveRework != 1 {
			t.Errorf("expected 1 active rework, got %d", readiness.ActiveRework)
		}
	})

	t.Run("Project_Rework_Summary", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/sales_orders/%s/rework/summary", soID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var summary models.ProjectReworkSummary
		_ = json.NewDecoder(rr.Body).Decode(&summary)
		if summary.TotalActive != 1 {
			t.Errorf("expected 1 active rework item in project, got %d", summary.TotalActive)
		}
	})

	t.Run("Complete_Rework_Auto_Fixes_Linked_Defect", func(t *testing.T) {
		completePayload := map[string]interface{}{
			"status": "complete",
		}

		body, _ := json.Marshal(completePayload)
		req := httptest.NewRequest(http.MethodPut, "/api/rework/items/"+createdReworkID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify linked defect auto-transitioned to 'fixed' with audit trail and notes
		var defStatus, defNotes string
		var resolvedAt sql.NullTime
		var resolvedBy sql.NullString
		err := db.DB.QueryRow("SELECT status, notes, resolved_at, resolved_by FROM defects WHERE id = $1", defectID).Scan(&defStatus, &defNotes, &resolvedAt, &resolvedBy)
		if err != nil {
			t.Fatalf("failed to query defect: %v", err)
		}
		if defStatus != "fixed" {
			t.Errorf("expected linked defect status to be 'fixed', got '%s'", defStatus)
		}
		if !resolvedAt.Valid {
			t.Errorf("expected resolved_at to be set on auto-fixed defect")
		}
		if !strings.Contains(defNotes, "[Auto-Resolved via Rework Part") {
			t.Errorf("expected notes to contain auto-resolved audit note, got: %s", defNotes)
		}
	})

	t.Run("Controls_Schematic_Redline_Lifecycle", func(t *testing.T) {
		createPayload := map[string]interface{}{
			"sales_order_id":       soID.String(),
			"machine_id":          machineID.String(),
			"schematic_number":    "SCH-1024-01",
			"master_copy_redlined": true,
			"redlines_description": "Added safety door interlock relay on circuit 4",
		}

		body, _ := json.Marshal(createPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/rework/controls", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var createResp map[string]interface{}
		_ = json.NewDecoder(rr.Body).Decode(&createResp)
		controlsID := createResp["id"].(string)

		// Sign-off
		signoffPayload := map[string]interface{}{
			"schematics_digitally_updated": true,
			"checklist_signed_off":         true,
		}
		body, _ = json.Marshal(signoffPayload)
		req = httptest.NewRequest(http.MethodPut, "/api/rework/controls/"+controlsID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr = httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify list
		req = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/rework/controls?machine_id=%s", machineID), nil)
		rr = httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}
