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
			"customer_name":           "Test Corp",
			"po_number":               "PO-TEST-123",
			"internal_project_number": "PRJ-9942",
			"project_name":            "VibroBowl Automation",
			"responsible_person":      "Bob Manager",
			"sales_rep":               "Alice",
			"target_ship_date":        time.Now().AddDate(0, 1, 0).Format(time.RFC3339),
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

	t.Run("Update Sales Order - Success", func(t *testing.T) {
		// First create an order to update
		var createdOrder models.SalesOrder
		err := db.DB.QueryRow(`
			INSERT INTO sales_orders (customer_name, po_number, status) 
			VALUES ('Update Test', 'PO-UP', 'open') 
			RETURNING id
		`).Scan(&createdOrder.ID)
		if err != nil {
			t.Fatalf("failed to create test order for update: %v", err)
		}

		updatePayload := map[string]interface{}{
			"customer_name": "Updated Corp",
			"po_number":     "PO-UPDATED",
			"status":        "partially_shipped",
		}
		body, _ := json.Marshal(updatePayload)
		req := httptest.NewRequest(http.MethodPut, "/api/sales_orders/"+createdOrder.ID.String(), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		// Verify update in DB
		var updatedName, updatedStatus string
		db.DB.QueryRow("SELECT customer_name, status FROM sales_orders WHERE id = $1", createdOrder.ID).Scan(&updatedName, &updatedStatus)
		if updatedName != "Updated Corp" || updatedStatus != "partially_shipped" {
			t.Errorf("expected updated values, got %s and %s", updatedName, updatedStatus)
		}

		db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", createdOrder.ID)
	})

	t.Run("Delete Sales Order - Success", func(t *testing.T) {
		// First create an order to delete
		var createdOrder models.SalesOrder
		err := db.DB.QueryRow(`
			INSERT INTO sales_orders (customer_name, po_number, status) 
			VALUES ('Delete Test', 'PO-DEL', 'open') 
			RETURNING id
		`).Scan(&createdOrder.ID)
		if err != nil {
			t.Fatalf("failed to create test order for delete: %v", err)
		}

		req := httptest.NewRequest(http.MethodDelete, "/api/sales_orders/"+createdOrder.ID.String(), nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
		}

		// Verify deletion
		var count int
		db.DB.QueryRow("SELECT COUNT(*) FROM sales_orders WHERE id = $1", createdOrder.ID).Scan(&count)
		if count != 0 {
			t.Errorf("expected record to be deleted, but it still exists")
		}
	})
}
