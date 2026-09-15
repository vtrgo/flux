package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

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
	mux.HandleFunc("PUT /api/machines/{id}", handleUpdateMachine)
	mux.Handle("DELETE /api/machines/{id}", RequireRole("admin", "manager")(http.HandlerFunc(handleDeleteMachine)))

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
	mux.HandleFunc("POST /api/sales_orders/{id}/close", handleCloseSalesOrder)
	mux.HandleFunc("POST /api/sales_orders/{id}/reopen", handleReopenSalesOrder)
	mux.Handle("DELETE /api/sales_orders/{id}", RequireRole("admin", "manager")(http.HandlerFunc(deleteSalesOrder)))

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
	mux.Handle("DELETE /api/defects/{defect_id}", RequireRole("admin", "manager")(http.HandlerFunc(handleDeleteDefect)))

	// Auth endpoints
	mux.HandleFunc("POST /api/auth/login", handleLogin)
	mux.HandleFunc("POST /api/auth/logout", handleLogout)
	mux.HandleFunc("GET /api/auth/me", handleGetMe)
	mux.HandleFunc("POST /api/auth/change_password", handleChangePassword)

	// Users endpoints
	mux.HandleFunc("GET /api/users", handleGetUsers)
	mux.Handle("POST /api/users", RequireRole("admin")(http.HandlerFunc(handleCreateUser)))
	mux.Handle("PUT /api/users/{id}", RequireRole("admin")(http.HandlerFunc(handleUpdateUser)))
	mux.Handle("DELETE /api/users/{id}", RequireRole("admin")(http.HandlerFunc(handleDeleteUser)))

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
	mux.HandleFunc("GET /api/system/version", handleGetSystemVersion)
	mux.HandleFunc("GET /api/system/timezone", handleGetTimezone)
	mux.HandleFunc("GET /api/system/timezones", handleGetAvailableTimezones)
	mux.Handle("PUT /api/system/timezone", RequireRole("admin")(http.HandlerFunc(handleUpdateTimezone)))

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
			m.id, m.sales_order_id, m.order_number, m.model_type, m.status, m.actual_ship_date, m.fat_date, m.lead, m.created_at, m.created_by,
			COUNT(DISTINCT k.id) as kitting_count,
			COUNT(DISTINCT a.id) as assembly_count,
			COUNT(DISTINCT c.id) as controls_count,
			COUNT(DISTINCT d.id) as quality_count,
			u.username as created_by_user_name
		FROM machines m
		LEFT JOIN kitting_parts k ON m.id = k.machine_id
		LEFT JOIN assembly_tasks a ON m.id = a.machine_id
		LEFT JOIN controls_checkpoints c ON m.id = c.machine_id
		LEFT JOIN defects d ON m.id = d.machine_id
		LEFT JOIN users u ON m.created_by = u.id
	`
	var args []interface{}
	if soStatusNeq != "" {
		query += `
		LEFT JOIN sales_orders so ON m.sales_order_id = so.id
		WHERE (so.status != $1 OR m.sales_order_id IS NULL)
		`
		args = append(args, soStatusNeq)
	}

	query += `
		GROUP BY m.id, u.username
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
			&m.ID, &m.SalesOrderID, &m.OrderNumber, &m.ModelType, &m.Status, &m.ActualShipDate, &m.FATDate, &m.Lead, &m.CreatedAt, &m.CreatedBy,
			&m.KittingCount, &m.AssemblyCount, &m.ControlsCount, &m.QualityCount, &m.CreatedByUserName,
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
		SalesOrderID *string    `json:"sales_order_id"`
		OrderNumber  string     `json:"order_number"`
		ModelType    string     `json:"model_type"`
		FATDate      *time.Time `json:"fat_date"`
		Lead         *string    `json:"lead"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	if req.OrderNumber == "" || req.ModelType == "" {
		respondError(w, http.StatusBadRequest, "OrderNumber and ModelType are required", nil)
		return
	}

	var userID *string
	if user, ok := r.Context().Value(UserContextKey).(*models.User); ok && user != nil {
		idStr := user.ID.String()
		userID = &idStr
	}

	var newMachine models.Machine
	var err error
	if req.SalesOrderID != nil && *req.SalesOrderID != "" {
		err = db.DB.QueryRow(`
			INSERT INTO machines (sales_order_id, order_number, model_type, fat_date, lead, status, created_by) 
			VALUES ($1, $2, $3, $4, $5, 'engineering', $6) 
			RETURNING id, sales_order_id, order_number, model_type, status, actual_ship_date, fat_date, lead, created_at, created_by
		`, req.SalesOrderID, req.OrderNumber, req.ModelType, req.FATDate, req.Lead, userID).Scan(
			&newMachine.ID, &newMachine.SalesOrderID, &newMachine.OrderNumber, &newMachine.ModelType, &newMachine.Status, &newMachine.ActualShipDate, &newMachine.FATDate, &newMachine.Lead, &newMachine.CreatedAt, &newMachine.CreatedBy,
		)
	} else {
		err = db.DB.QueryRow(`
			INSERT INTO machines (order_number, model_type, fat_date, lead, status, created_by) 
			VALUES ($1, $2, $3, $4, 'engineering', $5) 
			RETURNING id, order_number, model_type, status, actual_ship_date, fat_date, lead, created_at, created_by
		`, req.OrderNumber, req.ModelType, req.FATDate, req.Lead, userID).Scan(
			&newMachine.ID, &newMachine.OrderNumber, &newMachine.ModelType, &newMachine.Status, &newMachine.ActualShipDate, &newMachine.FATDate, &newMachine.Lead, &newMachine.CreatedAt, &newMachine.CreatedBy,
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

func handleUpdateMachine(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	var req struct {
		OrderNumber *string    `json:"order_number"`
		ModelType   *string    `json:"model_type"`
		Status      *string    `json:"status"`
		FATDate     *time.Time `json:"fat_date"`
		Lead        *string    `json:"lead"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	var userID *string
	if user, ok := r.Context().Value(UserContextKey).(*models.User); ok && user != nil {
		idStr := user.ID.String()
		userID = &idStr
	}

	var m models.Machine
	err := db.DB.QueryRow(`
		UPDATE machines
		SET order_number = COALESCE($1, order_number),
		    model_type = COALESCE($2, model_type),
		    status = COALESCE($3, status),
		    fat_date = $4,
		    lead = $5,
		    updated_by = $6
		WHERE id = $7
		RETURNING id, sales_order_id, order_number, model_type, status, actual_ship_date, fat_date, lead, created_at, created_by, updated_by
	`, req.OrderNumber, req.ModelType, req.Status, req.FATDate, req.Lead, userID, id).Scan(
		&m.ID, &m.SalesOrderID, &m.OrderNumber, &m.ModelType, &m.Status, &m.ActualShipDate, &m.FATDate, &m.Lead, &m.CreatedAt, &m.CreatedBy, &m.UpdatedBy,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Machine not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update machine: ", err)
		return
	}

	BroadcastEvent("machine_updated", m)
	slog.Info("Machine updated", "machine_id", m.ID, "lead", m.Lead)
	respondJSON(w, http.StatusOK, m)
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
