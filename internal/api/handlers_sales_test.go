package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func createTestRoleCookie(t *testing.T, role string) *http.Cookie {
	t.Helper()
	var adminID string
	adminUsername := fmt.Sprintf("admin_test_%d", time.Now().UnixNano())
	err := db.DB.QueryRow(`
		INSERT INTO users (username, first_name, last_name, department, role, password_hash)
		VALUES ($1, 'Admin', 'User', 'management', $2, 'hash')
		RETURNING id
	`, adminUsername, role).Scan(&adminID)
	if err != nil {
		t.Fatalf("failed to insert test admin user: %v", err)
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: adminID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(GetJWTSecret())
	if err != nil {
		t.Fatalf("failed to sign admin token: %v", err)
	}

	return &http.Cookie{
		Name:     "auth_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		Path:     "/",
	}
}

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
		if err := db.DB.QueryRow("SELECT customer_name, status FROM sales_orders WHERE id = $1", createdOrder.ID).Scan(&updatedName, &updatedStatus); err != nil {
			t.Fatalf("failed to query updated sales order: %v", err)
		}
		if updatedName != "Updated Corp" || updatedStatus != "partially_shipped" {
			t.Errorf("expected updated values, got %s and %s", updatedName, updatedStatus)
		}

		_, err = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", createdOrder.ID)
		if err != nil {
			t.Logf("cleanup failed: %v", err)
		}
	})

	t.Run("Close and Reopen Sales Order - Success", func(t *testing.T) {
		var createdOrder models.SalesOrder
		poLife := fmt.Sprintf("PO-LIFE-%d", time.Now().UnixNano())
		err := db.DB.QueryRow(`
			INSERT INTO sales_orders (customer_name, po_number, status) 
			VALUES ('Lifecycle Test', $1, 'open') 
			RETURNING id
		`, poLife).Scan(&createdOrder.ID)
		if err != nil {
			t.Fatalf("failed to create test order: %v", err)
		}
		defer func() {
			_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", createdOrder.ID)
		}()

		// 1. Close
		reqClose := httptest.NewRequest(http.MethodPost, "/api/sales_orders/"+createdOrder.ID.String()+"/close", nil)
		rrClose := httptest.NewRecorder()
		mux.ServeHTTP(rrClose, reqClose)
		if rrClose.Code != http.StatusOK {
			t.Fatalf("expected 200 on close, got %d: %s", rrClose.Code, rrClose.Body.String())
		}
		var closed models.SalesOrder
		if err := json.NewDecoder(rrClose.Body).Decode(&closed); err != nil {
			t.Fatalf("failed to decode close response: %v", err)
		}
		if closed.Status != "closed" {
			t.Errorf("expected status 'closed', got %s", closed.Status)
		}

		// 2. Reopen
		reqReopen := httptest.NewRequest(http.MethodPost, "/api/sales_orders/"+createdOrder.ID.String()+"/reopen", nil)
		rrReopen := httptest.NewRecorder()
		mux.ServeHTTP(rrReopen, reqReopen)
		if rrReopen.Code != http.StatusOK {
			t.Fatalf("expected 200 on reopen, got %d: %s", rrReopen.Code, rrReopen.Body.String())
		}
		var reopened models.SalesOrder
		if err := json.NewDecoder(rrReopen.Body).Decode(&reopened); err != nil {
			t.Fatalf("failed to decode reopen response: %v", err)
		}
		if reopened.Status != "open" {
			t.Errorf("expected status 'open', got %s", reopened.Status)
		}
	})

	t.Run("Delete Sales Order - Authorization Checks", func(t *testing.T) {
		// First create an order to delete
		var createdOrder models.SalesOrder
		poDel := fmt.Sprintf("PO-DEL-%d", time.Now().UnixNano())
		err := db.DB.QueryRow(`
			INSERT INTO sales_orders (customer_name, po_number, status) 
			VALUES ('Delete Test', $1, 'open') 
			RETURNING id
		`, poDel).Scan(&createdOrder.ID)
		if err != nil {
			t.Fatalf("failed to create test order for delete: %v", err)
		}

		// 1. Unauthenticated / Non-admin should get 403 Forbidden
		reqUnauth := httptest.NewRequest(http.MethodDelete, "/api/sales_orders/"+createdOrder.ID.String(), nil)
		rrUnauth := httptest.NewRecorder()
		mux.ServeHTTP(rrUnauth, reqUnauth)
		if rrUnauth.Code != http.StatusUnauthorized {
			t.Errorf("expected 403 Forbidden for non-admin delete, got %d", rrUnauth.Code)
		}

		// 2. Create test admin user and generate auth cookie
		adminCookie := createTestRoleCookie(t, "manager")

		reqAuth := httptest.NewRequest(http.MethodDelete, "/api/sales_orders/"+createdOrder.ID.String(), nil)
		reqAuth.AddCookie(adminCookie)
		rrAuth := httptest.NewRecorder()
		AuthMiddleware(mux).ServeHTTP(rrAuth, reqAuth)

		if status := rrAuth.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code for admin: got %v want %v: %s", status, http.StatusOK, rrAuth.Body.String())
		}

		// Verify deletion
		var count int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM sales_orders WHERE id = $1", createdOrder.ID).Scan(&count); err != nil {
			t.Fatalf("failed to query sales order count: %v", err)
		}
		if count != 0 {
			t.Errorf("expected record to be deleted, but it still exists")
		}
	})
}
