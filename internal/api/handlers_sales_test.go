package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func setupTestDB(t *testing.T) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "host=/var/run/postgresql dbname=flux sslmode=disable"
	}

	if err := db.InitDB(connStr); err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	
	// Ensure SSE hub is running to prevent panic on BroadcastEvent
	InitHub()
}

func TestSalesOrders(t *testing.T) {
	setupTestDB(t)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	t.Run("Create Sales Order - Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"customer_name": "Test Corp",
			"po_number":     "PO-TEST-123",
			"sales_rep":     "Alice",
			"target_ship_date": time.Now().AddDate(0, 1, 0).Format(time.RFC3339),
		}
		
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/sales_orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusCreated {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusCreated)
		}

		var resp models.SalesOrder
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Errorf("failed to decode response: %v", err)
		}

		if resp.CustomerName != "Test Corp" {
			t.Errorf("expected customer name to be 'Test Corp', got '%s'", resp.CustomerName)
		}
		
		// Clean up the created test record
		_, err := db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", resp.ID)
		if err != nil {
			t.Errorf("failed to clean up test record: %v", err)
		}
	})

	t.Run("Create Sales Order - Missing Fields (Failure)", func(t *testing.T) {
		payload := map[string]interface{}{
			// Missing customer_name and po_number
			"sales_rep": "Alice",
		}
		
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/sales_orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
		}
	})
}
