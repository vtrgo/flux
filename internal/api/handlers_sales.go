package api

import (
	"database/sql"
	"strings"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func handleSalesOrders(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case http.MethodGet:
		getSalesOrders(w, r)
	case http.MethodPost:
		createSalesOrder(w, r)
	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
	}
}

func getSalesOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	statusNeq := r.URL.Query().Get("status_neq")

	query := `
		SELECT 
			so.id, so.customer_name, so.po_number, so.internal_project_number, so.project_name, so.responsible_person, so.sales_rep, so.target_ship_date, so.actual_ship_date, so.status, so.created_at, so.created_by,
			u.username as created_by_user_name
		FROM sales_orders so
		LEFT JOIN users u ON so.created_by = u.id
	`
	var args []interface{}
	var whereClauses []string

	if status != "" {
		args = append(args, status)
		whereClauses = append(whereClauses, "so.status = $1")
	} else if statusNeq != "" {
		args = append(args, statusNeq)
		whereClauses = append(whereClauses, "so.status != $1")
	}

	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	query += " ORDER BY so.created_at DESC"

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	orders := []models.SalesOrder{}
	for rows.Next() {
		var o models.SalesOrder
		if err := rows.Scan(
			&o.ID, &o.CustomerName, &o.PONumber, &o.InternalProjectNumber, &o.ProjectName, &o.ResponsiblePerson, &o.SalesRep, &o.TargetShipDate, &o.ActualShipDate, &o.Status, &o.CreatedAt, &o.CreatedBy, &o.CreatedByUserName,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row: ", err)
			return
		}
		orders = append(orders, o)
	}

	if orders == nil {
		orders = []models.SalesOrder{}
	}

	respondJSON(w, http.StatusOK, orders)
}

func createSalesOrder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CustomerName          string     `json:"customer_name"`
		PONumber              string     `json:"po_number"`
		InternalProjectNumber *string    `json:"internal_project_number"`
		ProjectName           *string    `json:"project_name"`
		ResponsiblePerson     *string    `json:"responsible_person"`
		SalesRep              *string    `json:"sales_rep"`
		TargetShipDate        *time.Time `json:"target_ship_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.CustomerName == "" || req.PONumber == "" {
		respondError(w, http.StatusBadRequest, "CustomerName and PONumber are required", nil)
		return
	}

	var userID *string
	if user, ok := r.Context().Value(UserContextKey).(*models.User); ok && user != nil {
		idStr := user.ID.String()
		userID = &idStr
	}

	var newOrder models.SalesOrder
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, status, created_by) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8) 
		RETURNING id, customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, status, created_at, created_by
	`, req.CustomerName, req.PONumber, req.InternalProjectNumber, req.ProjectName, req.ResponsiblePerson, req.SalesRep, req.TargetShipDate, userID).Scan(
		&newOrder.ID, &newOrder.CustomerName, &newOrder.PONumber, &newOrder.InternalProjectNumber, &newOrder.ProjectName, &newOrder.ResponsiblePerson, &newOrder.SalesRep, &newOrder.TargetShipDate, &newOrder.Status, &newOrder.CreatedAt, &newOrder.CreatedBy,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert sales order: ", err)
		return
	}

	BroadcastEvent("sales_order_created", newOrder)

	respondJSON(w, http.StatusCreated, newOrder)
}

func updateSalesOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Missing ID", nil)
		return
	}

	var req struct {
		CustomerName          string     `json:"customer_name"`
		PONumber              string     `json:"po_number"`
		InternalProjectNumber *string    `json:"internal_project_number"`
		ProjectName           *string    `json:"project_name"`
		ResponsiblePerson     *string    `json:"responsible_person"`
		SalesRep              *string    `json:"sales_rep"`
		TargetShipDate        *time.Time `json:"target_ship_date"`
		ActualShipDate        *time.Time `json:"actual_ship_date"`
		Status                string     `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid input: ", err)
		return
	}

	// Auto-fill actual_ship_date if transitioned to fulfilled and not already set
	actualShipDate := req.ActualShipDate
	if req.Status == "fulfilled" && actualShipDate == nil {
		now := time.Now()
		actualShipDate = &now
	}

	_, err := db.DB.Exec(`
		UPDATE sales_orders 
		SET customer_name = $1, po_number = $2, internal_project_number = $3, project_name = $4, responsible_person = $5, sales_rep = $6, target_ship_date = $7, status = $8,
		    actual_ship_date = COALESCE($10, actual_ship_date)
		WHERE id = $9
	`, req.CustomerName, req.PONumber, req.InternalProjectNumber, req.ProjectName, req.ResponsiblePerson, req.SalesRep, req.TargetShipDate, req.Status, id, actualShipDate)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}

	BroadcastEvent("sales_order_updated", map[string]string{"id": id, "status": req.Status})
	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// handleCloseSalesOrder transitions a project to 'closed' (archived)
func handleCloseSalesOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Missing ID", nil)
		return
	}

	var o models.SalesOrder
	err := db.DB.QueryRow(`
		UPDATE sales_orders
		SET status = 'closed'
		WHERE id = $1
		RETURNING id, customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, actual_ship_date, status, created_at
	`, id).Scan(
		&o.ID, &o.CustomerName, &o.PONumber, &o.InternalProjectNumber, &o.ProjectName, &o.ResponsiblePerson, &o.SalesRep, &o.TargetShipDate, &o.ActualShipDate, &o.Status, &o.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to close sales order: ", err)
		return
	}

	BroadcastEvent("sales_order_updated", o)
	respondJSON(w, http.StatusOK, o)
}

// handleReopenSalesOrder transitions a closed project back to 'open'
func handleReopenSalesOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Missing ID", nil)
		return
	}

	var o models.SalesOrder
	err := db.DB.QueryRow(`
		UPDATE sales_orders
		SET status = 'open'
		WHERE id = $1
		RETURNING id, customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, actual_ship_date, status, created_at
	`, id).Scan(
		&o.ID, &o.CustomerName, &o.PONumber, &o.InternalProjectNumber, &o.ProjectName, &o.ResponsiblePerson, &o.SalesRep, &o.TargetShipDate, &o.ActualShipDate, &o.Status, &o.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to reopen sales order: ", err)
		return
	}

	BroadcastEvent("sales_order_updated", o)
	respondJSON(w, http.StatusOK, o)
}

// deleteSalesOrder permanently deletes a sales order, restricted strictly to administrators
func deleteSalesOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Missing ID", nil)
		return
	}

	_, err := db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}

	BroadcastEvent("sales_order_deleted", map[string]string{"id": id})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

