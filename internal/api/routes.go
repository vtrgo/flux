package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/logger"
	"github.com/vtrgo/flux/internal/models"
)

// CorsMiddleware handles CORS headers and preflight OPTIONS requests
func CorsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/machines", handleMachines)
	mux.HandleFunc("DELETE /api/machines/{id}", handleDeleteMachine)

	// Sales endpoints
	mux.HandleFunc("/api/sales_orders", handleSalesOrders)

	// Kitting endpoints
	mux.HandleFunc("GET /api/kitting", handleGetAllKitting)
	mux.HandleFunc("GET /api/machines/{id}/kitting", handleGetKitting)
	mux.HandleFunc("POST /api/machines/{id}/kitting", handleAddKittingPart)
	mux.HandleFunc("PUT /api/kitting/{part_id}", handleUpdateKittingPart)

	// Assembly endpoints
	mux.HandleFunc("GET /api/assembly", handleGetAllAssembly)
	mux.HandleFunc("GET /api/machines/{id}/assembly", handleGetAssembly)
	mux.HandleFunc("POST /api/machines/{id}/assembly", handleAddAssemblyTask)
	mux.HandleFunc("PUT /api/assembly/{task_id}", handleUpdateAssemblyTask)

	// Sales Orders
	mux.HandleFunc("GET /api/sales_orders", getSalesOrders)
	mux.HandleFunc("POST /api/sales_orders", createSalesOrder)
	mux.HandleFunc("PUT /api/sales_orders/{id}", updateSalesOrder)
	mux.HandleFunc("DELETE /api/sales_orders/{id}", deleteSalesOrder)

	// Enclosures endpoints
	mux.HandleFunc("GET /api/enclosures", handleGetAllEnclosures)
	mux.HandleFunc("GET /api/machines/{id}/enclosures", handleGetEnclosures)
	mux.HandleFunc("POST /api/machines/{id}/enclosures", handleAddEnclosuresTask)
	mux.HandleFunc("PUT /api/enclosures/{task_id}", handleUpdateEnclosuresTask)

	// Controls endpoints
	mux.HandleFunc("GET /api/controls", handleGetAllControls)
	mux.HandleFunc("GET /api/machines/{id}/controls", handleGetControls)
	mux.HandleFunc("POST /api/machines/{id}/controls", handleAddControlsCheckpoint)
	mux.HandleFunc("PUT /api/controls/{check_id}", handleUpdateControlsCheckpoint)

	// Quality endpoints
	mux.HandleFunc("GET /api/machines/{id}/quality", handleGetQuality)
	mux.HandleFunc("GET /api/machines/{id}/defects", handleGetMachineDefects)
	mux.HandleFunc("GET /api/machines/{id}/defects/summary", handleGetMachineDefectsSummary)
	mux.HandleFunc("POST /api/machines/{id}/defects", handleAddDefect)
	mux.HandleFunc("GET /api/defects", handleGetAllDefects)
	mux.HandleFunc("GET /api/defects/summary", handleGetAllDefectsSummary)
	mux.HandleFunc("GET /api/defects/machine_summary", handleGetMachineDefectSummaries)
	mux.HandleFunc("GET /api/defects/project_summary", handleGetProjectDefectSummaries)
	mux.HandleFunc("GET /api/defects/project_department_summary", handleGetProjectDepartmentDefectSummaries)
	mux.HandleFunc("PUT /api/defects/{defect_id}", handleUpdateDefect)
	mux.HandleFunc("PUT /api/defects/{defect_id}/edit", handleEditDefect)
	mux.HandleFunc("DELETE /api/defects/{defect_id}", handleDeleteDefect)

	// Attachments endpoints (often tied to defects/issues)
	mux.HandleFunc("POST /api/issues/{issue_id}/attachments", handleUploadAttachment)
	mux.HandleFunc("GET /api/attachments/{attachment_id}", handleServeAttachment)
	mux.HandleFunc("DELETE /api/attachments/{id}", handleDeleteAttachment)
	mux.HandleFunc("GET /api/issues/{issue_id}/attachments", handleListIssueAttachments)

	// Design endpoints
	mux.HandleFunc("GET /api/design/feedback", handleGetAllDesignFeedback)
	mux.HandleFunc("GET /api/machines/{id}/design", handleGetDesign)
	mux.HandleFunc("POST /api/machines/{id}/design/feedback", handleAddDesignFeedback)
	mux.HandleFunc("PUT /api/design/feedback/{feedback_id}", handleUpdateDesignFeedback)
	mux.HandleFunc("GET /api/machine-shop/tasks", handleGetAllMachineShopTasks)
	mux.HandleFunc("POST /api/machine-shop/tasks", handleAddMachineShopTask)
	mux.HandleFunc("PUT /api/machine-shop/tasks/{task_id}", handleUpdateMachineShopTask)

	mux.HandleFunc("GET /api/laser/tasks", handleGetAllLaserTasks)
	mux.HandleFunc("POST /api/laser/tasks", handleAddLaserTask)
	mux.HandleFunc("PUT /api/laser/tasks/{task_id}", handleUpdateLaserTask)

	mux.HandleFunc("GET /api/logs", handleGetLogs)

	mux.HandleFunc("/api/sse", SSEHandler)
}

func handleGetLogs(w http.ResponseWriter, r *http.Request) {
	// Import the logger package up top to use logger.ReadLastLogLines
	// Let's assume we read the last 100KB (~1000 lines max)
	const readBytes = 100 * 1024 
	
	logs, err := logger.ReadLastLogLines(int64(readBytes))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to read logs", err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"logs": logs})
}

func handleMachines(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		getMachines(w, r)
	case http.MethodPost:
		createMachine(w, r)
	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
	}
}

func getMachines(w http.ResponseWriter, r *http.Request) {
	soStatusNeq := r.URL.Query().Get("sales_order_status_neq")

	query := `
		SELECT 
			m.id, m.sales_order_id, m.order_number, m.model_type, m.status, m.actual_ship_date, m.created_at,
			COUNT(DISTINCT k.id) as kitting_count,
			COUNT(DISTINCT a.id) as assembly_count,
			COUNT(DISTINCT c.id) as controls_count,
			COUNT(DISTINCT d.id) as quality_count
		FROM machines m
		LEFT JOIN kitting_parts k ON m.id = k.machine_id
		LEFT JOIN assembly_tasks a ON m.id = a.machine_id
		LEFT JOIN controls_checkpoints c ON m.id = c.machine_id
		LEFT JOIN defects d ON m.id = d.machine_id
	`
	var args []interface{}
	if soStatusNeq != "" {
		query += `
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE so.status != $1 OR m.sales_order_id IS NULL
		`
		args = append(args, soStatusNeq)
	}

	query += `
		GROUP BY m.id
		ORDER BY m.created_at DESC
	`

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error: ", err)
		return
	}
	defer rows.Close()

	machines := []models.Machine{}
	for rows.Next() {
		var m models.Machine
		if err := rows.Scan(
			&m.ID, &m.SalesOrderID, &m.OrderNumber, &m.ModelType, &m.Status, &m.ActualShipDate, &m.CreatedAt,
			&m.KittingCount, &m.AssemblyCount, &m.ControlsCount, &m.QualityCount,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Error scanning row: ", err)
			return
		}
		machines = append(machines, m)
	}

	respondJSON(w, http.StatusOK, machines)
}

func createMachine(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SalesOrderID *string `json:"sales_order_id"`
		OrderNumber  string  `json:"order_number"`
		ModelType    string  `json:"model_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.OrderNumber == "" || req.ModelType == "" {
		respondError(w, http.StatusBadRequest, "OrderNumber and ModelType are required", nil)
		return
	}

	var newMachine models.Machine
	var err error
	if req.SalesOrderID != nil && *req.SalesOrderID != "" {
		err = db.DB.QueryRow(`
			INSERT INTO machines (sales_order_id, order_number, model_type, status) 
			VALUES ($1, $2, $3, 'engineering') 
			RETURNING id, sales_order_id, order_number, model_type, status, created_at
		`, req.SalesOrderID, req.OrderNumber, req.ModelType).Scan(
			&newMachine.ID, &newMachine.SalesOrderID, &newMachine.OrderNumber, &newMachine.ModelType, &newMachine.Status, &newMachine.CreatedAt,
		)
	} else {
		err = db.DB.QueryRow(`
			INSERT INTO machines (order_number, model_type, status) 
			VALUES ($1, $2, 'engineering') 
			RETURNING id, order_number, model_type, status, created_at
		`, req.OrderNumber, req.ModelType).Scan(
			&newMachine.ID, &newMachine.OrderNumber, &newMachine.ModelType, &newMachine.Status, &newMachine.CreatedAt,
		)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to insert machine: ", err)
		return
	}

	// Seed the relational tables to test our integration
	_, seedErr := db.DB.Exec(`
		INSERT INTO design_documents (machine_id, document_type, version, file_url)
		VALUES ($1, 'cad_model', 'v1.0.0', 'https://pdm.vtr.internal/models/frame.step')
	`, newMachine.ID)
	if seedErr != nil {
		// Log but don't fail the request since this is just seed data
		fmt.Printf("Failed to seed relational data for machine %s: %v\n", newMachine.ID, seedErr)
	}

	BroadcastEvent("machine_created", newMachine)

	slog.Debug("Machine created", "machine_id", newMachine.ID, "order_number", newMachine.OrderNumber)

	respondJSON(w, http.StatusCreated, newMachine)
}

func handleDeleteMachine(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	// Collect all defect IDs for this machine so we can clean up their
	// attachment files from disk before the DB cascade wipes the metadata rows.
	rows, err := db.DB.Query("SELECT id FROM defects WHERE machine_id = $1", id)
	if err != nil {
		slog.Error("Failed to query defects for machine attachment cleanup", "machine_id", id, "error", err)
	} else {
		var defectIDs []string
		for rows.Next() {
			var defectID string
			if err := rows.Scan(&defectID); err == nil {
				defectIDs = append(defectIDs, defectID)
			}
		}
		rows.Close()
		deleteAttachmentFilesForIssues(defectIDs)
	}

	_, err = db.DB.Exec("DELETE FROM machines WHERE id = $1", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete machine: ", err)
		return
	}

	BroadcastEvent("machine_deleted", map[string]string{"id": id})
	slog.Debug("Machine deleted", "machine_id", id)
	w.WriteHeader(http.StatusOK)
}
