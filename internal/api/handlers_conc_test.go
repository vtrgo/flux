package api

import (
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

func TestCostOfNonConformanceHandlers(t *testing.T) {
	connStr := "host=/var/run/postgresql dbname=flux_test sslmode=disable"
	if err := db.InitDB(connStr); err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Setup: create test sales order, machine, user, rework item, defect, and time entries
	var soID uuid.UUID
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (project_name, customer_name, po_number)
		VALUES ('CoNC Test Project', 'CoNC Client', 'PO-CONC-001')
		RETURNING id
	`).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to insert test sales order: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	}()

	var machineID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, 'CONC-MACH-01', 'High-Speed Feeder', 'assembly')
		RETURNING id
	`, soID).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to insert test machine: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
	}()

	var userID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO users (username, password_hash, role, department)
		VALUES ('conc_tester_' || substr(gen_random_uuid()::text, 1, 8), 'hash', 'technician', 'assembly')
		RETURNING id
	`).Scan(&userID)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM users WHERE id = $1", userID)
	}()

	// 1. Create a defect (standard)
	var defectID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status, is_ncr)
		VALUES ($1, 'assembly', 'assembly', 'Misaligned guide rail', 'moderate', 'open', FALSE)
		RETURNING id
	`, machineID).Scan(&defectID)
	if err != nil {
		t.Fatalf("failed to insert test defect: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM defects WHERE id = $1", defectID)
	}()

	// 2. Create an NCR defect
	var ncrID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO defects (machine_id, source_department, assigned_department, description, severity, status, is_ncr, ncr_number)
		VALUES ($1, 'quality', 'machining', 'Critical tolerance oversized shaft', 'critical', 'open', TRUE, 'NCR-CONC-01')
		RETURNING id
	`, machineID).Scan(&ncrID)
	if err != nil {
		t.Fatalf("failed to insert test NCR: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM defects WHERE id = $1", ncrID)
	}()

	// 3. Create a rework item linked to NCR
	var rwID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO rework_items (
			sales_order_id, machine_id, defect_id, project_number, part_number,
			description, revision, material, status, reason_for_rework, estimated_hours
		) VALUES ($1, $2, $3, 'PRJ-CONC', 'CONC-RW-01', 'Shaft Remake', 'B', 'Steel', 'in_machining', 'Oversized per NCR', 6.0)
		RETURNING id
	`, soID, machineID, ncrID).Scan(&rwID)
	if err != nil {
		t.Fatalf("failed to insert test rework item: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM rework_items WHERE id = $1", rwID)
	}()

	// 4. Log time entries:
	// - 10.0 hrs production
	// - 4.0 hrs rework
	// - 2.5 hrs defect resolution (issue_fix)
	// - 1.5 hrs NCR resolution (issue_fix)
	workDate := time.Now().Format("2006-01-02")
	_, err = db.DB.Exec(`
		INSERT INTO time_entries (user_id, machine_id, entry_type, work_date, hours_spent, work_description)
		VALUES ($1, $2, 'production', $3::date, 10.00, 'Baseline Assembly')
	`, userID, machineID, workDate)
	if err != nil {
		t.Fatalf("failed to insert production time entry: %v", err)
	}

	_, err = db.DB.Exec(`
		INSERT INTO time_entries (user_id, machine_id, rework_item_id, entry_type, work_date, hours_spent, work_description)
		VALUES ($1, $2, $3, 'rework', $4::date, 4.00, 'Rework machining shaft')
	`, userID, machineID, rwID, workDate)
	if err != nil {
		t.Fatalf("failed to insert rework time entry: %v", err)
	}

	_, err = db.DB.Exec(`
		INSERT INTO time_entries (user_id, machine_id, defect_id, entry_type, work_date, hours_spent, work_description)
		VALUES ($1, $2, $3, 'issue_fix', $4::date, 2.50, 'Re-aligning guide rail')
	`, userID, machineID, defectID, workDate)
	if err != nil {
		t.Fatalf("failed to insert defect time entry: %v", err)
	}

	_, err = db.DB.Exec(`
		INSERT INTO time_entries (user_id, machine_id, defect_id, entry_type, work_date, hours_spent, work_description)
		VALUES ($1, $2, $3, 'issue_fix', $4::date, 1.50, 'NCR shaft analysis')
	`, userID, machineID, ncrID, workDate)
	if err != nil {
		t.Fatalf("failed to insert NCR time entry: %v", err)
	}

	t.Run("Get_CoNC_Summary_Default_Rate", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/analytics/conc?sales_order_id=%s", soID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var summary models.CoNCSummaryResponse
		if err := json.NewDecoder(rr.Body).Decode(&summary); err != nil {
			t.Fatalf("failed to parse CoNC response: %v", err)
		}

		if summary.HourlyRate != 85.00 {
			t.Errorf("expected default hourly rate 85.00, got %f", summary.HourlyRate)
		}
		if summary.TotalProductionHours != 10.0 {
			t.Errorf("expected 10.0 production hours, got %f", summary.TotalProductionHours)
		}
		if summary.TotalReworkHours != 4.0 {
			t.Errorf("expected 4.0 rework hours, got %f", summary.TotalReworkHours)
		}
		if summary.TotalDefectHours != 2.5 {
			t.Errorf("expected 2.5 defect hours, got %f", summary.TotalDefectHours)
		}
		// NCR hours = 1.5 (from issue_fix on ncrID) + 4.0 (from rework linked to ncrID) = 5.5
		if summary.TotalNCRHours != 5.5 {
			t.Errorf("expected 5.5 NCR hours, got %f", summary.TotalNCRHours)
		}
		// Total CoNC hours = 4.0 (rework) + 2.5 (defect) + 1.5 (ncr) = 8.0
		if summary.TotalCoNCHours != 8.0 {
			t.Errorf("expected 8.0 total CoNC hours, got %f", summary.TotalCoNCHours)
		}
		// Total CoNC Cost = 8.0 * 85 = 680.00
		if summary.TotalCoNCCost != 680.00 {
			t.Errorf("expected 680.00 CoNC cost, got %f", summary.TotalCoNCCost)
		}
		// CoNC % of labor = 8.0 / (10.0 + 8.0) * 100 = 44.44%
		if summary.CoNCPercentageOfLabor != 44.44 {
			t.Errorf("expected 44.44%% CoNC of labor, got %f", summary.CoNCPercentageOfLabor)
		}
	})

	t.Run("Get_CoNC_Summary_Custom_Hourly_Rate", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/analytics/conc?sales_order_id=%s&hourly_rate=100.00", soID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var summary models.CoNCSummaryResponse
		_ = json.NewDecoder(rr.Body).Decode(&summary)

		if summary.HourlyRate != 100.00 {
			t.Errorf("expected hourly rate 100.00, got %f", summary.HourlyRate)
		}
		if summary.TotalCoNCCost != 800.00 {
			t.Errorf("expected 800.00 CoNC cost at $100/hr, got %f", summary.TotalCoNCCost)
		}
	})

	t.Run("Get_Machine_CoNC_Detail", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/conc?hourly_rate=90.00", machineID), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var detail models.CoNCMachineDetailResponse
		if err := json.NewDecoder(rr.Body).Decode(&detail); err != nil {
			t.Fatalf("failed to parse detail response: %v", err)
		}

		if detail.OrderNumber != "CONC-MACH-01" {
			t.Errorf("expected order number CONC-MACH-01, got %s", detail.OrderNumber)
		}
		if detail.TotalCoNCHours != 8.0 {
			t.Errorf("expected 8.0 CoNC hours on machine, got %f", detail.TotalCoNCHours)
		}
		if detail.TotalCoNCCost != 720.00 { // 8.0 * 90.00 = 720.00
			t.Errorf("expected 720.00 CoNC cost on machine, got %f", detail.TotalCoNCCost)
		}
		if len(detail.ReworkItems) == 0 {
			t.Errorf("expected at least 1 rework item in machine breakdown")
		}
		if len(detail.DefectItems) < 2 {
			t.Errorf("expected at least 2 defect items in machine breakdown, got %d", len(detail.DefectItems))
		}
	})

	t.Run("Get_Machine_CoNC_Invalid_ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines/not-a-uuid/conc", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400 on invalid machine ID, got %d", rr.Code)
		}
	})

	t.Run("Get_Machine_CoNC_Not_Found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/machines/%s/conc", uuid.New()), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("expected 404 on non-existent machine ID, got %d", rr.Code)
		}
	})
}
