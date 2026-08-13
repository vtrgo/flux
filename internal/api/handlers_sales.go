package api

import (
	"encoding/json"
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
	rows, err := db.DB.Query(`
		SELECT 
			id, customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, status, created_at
		FROM sales_orders
		ORDER BY created_at DESC
	`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	var orders []models.SalesOrder
	for rows.Next() {
		var o models.SalesOrder
		if err := rows.Scan(
			&o.ID, &o.CustomerName, &o.PONumber, &o.InternalProjectNumber, &o.ProjectName, &o.ResponsiblePerson, &o.SalesRep, &o.TargetShipDate, &o.Status, &o.CreatedAt,
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

	var newOrder models.SalesOrder
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, status) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'open') 
		RETURNING id, customer_name, po_number, internal_project_number, project_name, responsible_person, sales_rep, target_ship_date, status, created_at
	`, req.CustomerName, req.PONumber, req.InternalProjectNumber, req.ProjectName, req.ResponsiblePerson, req.SalesRep, req.TargetShipDate).Scan(
		&newOrder.ID, &newOrder.CustomerName, &newOrder.PONumber, &newOrder.InternalProjectNumber, &newOrder.ProjectName, &newOrder.ResponsiblePerson, &newOrder.SalesRep, &newOrder.TargetShipDate, &newOrder.Status, &newOrder.CreatedAt,
	)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert sales order: ", err)
		return
	}

	BroadcastEvent("sales_order_created", newOrder)

	w.WriteHeader(http.StatusCreated)
	respondJSON(w, http.StatusOK, newOrder)
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
		Status                string     `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid input: ", err)
		return
	}

	_, err := db.DB.Exec(`
		UPDATE sales_orders 
		SET customer_name = $1, po_number = $2, internal_project_number = $3, project_name = $4, responsible_person = $5, sales_rep = $6, target_ship_date = $7, status = $8
		WHERE id = $9
	`, req.CustomerName, req.PONumber, req.InternalProjectNumber, req.ProjectName, req.ResponsiblePerson, req.SalesRep, req.TargetShipDate, req.Status, id)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}

	BroadcastEvent("sales_order_updated", map[string]string{"id": id})
	w.WriteHeader(http.StatusOK)
	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

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
	w.WriteHeader(http.StatusOK)
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
