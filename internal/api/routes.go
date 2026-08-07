package api

import (
	"encoding/json"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
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

	// Controls endpoints
	mux.HandleFunc("GET /api/controls", handleGetAllControls)
	mux.HandleFunc("GET /api/machines/{id}/controls", handleGetControls)
	mux.HandleFunc("POST /api/machines/{id}/controls", handleAddControlsCheckpoint)
	mux.HandleFunc("PUT /api/controls/{check_id}", handleUpdateControlsCheckpoint)

	// Quality endpoints
	mux.HandleFunc("GET /api/machines/{id}/quality", handleGetQuality)
	mux.HandleFunc("GET /api/machines/{id}/defects", handleGetMachineDefects)
	mux.HandleFunc("POST /api/machines/{id}/defects", handleAddDefect)
	mux.HandleFunc("GET /api/defects", handleGetAllDefects)
	mux.HandleFunc("PUT /api/defects/{defect_id}", handleUpdateDefect)
	mux.HandleFunc("PUT /api/defects/{defect_id}/edit", handleEditDefect)
	mux.HandleFunc("DELETE /api/defects/{defect_id}", handleDeleteDefect)

	// Design endpoints
	mux.HandleFunc("GET /api/design/feedback", handleGetAllDesignFeedback)
	mux.HandleFunc("GET /api/machines/{id}/design", handleGetDesign)
	mux.HandleFunc("POST /api/machines/{id}/design/feedback", handleAddDesignFeedback)
	mux.HandleFunc("PUT /api/design/feedback/{feedback_id}", handleUpdateDesignFeedback)
	mux.HandleFunc("GET /api/machine-shop/tasks", handleGetAllMachineShopTasks)
	mux.HandleFunc("POST /api/machine-shop/tasks", handleAddMachineShopTask)
	mux.HandleFunc("PUT /api/machine-shop/tasks/{task_id}", handleUpdateMachineShopTask)

	mux.HandleFunc("/api/sse", SSEHandler)
}

func handleMachines(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
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
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func getMachines(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT 
			m.id, m.order_number, m.model_type, m.status, m.created_at,
			COUNT(DISTINCT k.id) as kitting_count,
			COUNT(DISTINCT a.id) as assembly_count,
			COUNT(DISTINCT c.id) as controls_count,
			COUNT(DISTINCT d.id) as quality_count
		FROM machines m
		LEFT JOIN kitting_parts k ON m.id = k.machine_id
		LEFT JOIN assembly_tasks a ON m.id = a.machine_id
		LEFT JOIN controls_checkpoints c ON m.id = c.machine_id
		LEFT JOIN defects d ON m.id = d.machine_id
		GROUP BY m.id
		ORDER BY m.created_at DESC
	`)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	machines := []models.Machine{}
	for rows.Next() {
		var m models.Machine
		if err := rows.Scan(
			&m.ID, &m.OrderNumber, &m.ModelType, &m.Status, &m.CreatedAt,
			&m.KittingCount, &m.AssemblyCount, &m.ControlsCount, &m.QualityCount,
		); err != nil {
			http.Error(w, "Error scanning row: "+err.Error(), http.StatusInternalServerError)
			return
		}
		machines = append(machines, m)
	}

	json.NewEncoder(w).Encode(machines)
}

func createMachine(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderNumber string `json:"order_number"`
		ModelType   string `json:"model_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.OrderNumber == "" || req.ModelType == "" {
		http.Error(w, "OrderNumber and ModelType are required", http.StatusBadRequest)
		return
	}

	var newMachine models.Machine
	err := db.DB.QueryRow(`
		INSERT INTO machines (order_number, model_type, status) 
		VALUES ($1, $2, 'kitting') 
		RETURNING id, order_number, model_type, status, created_at
	`, req.OrderNumber, req.ModelType).Scan(
		&newMachine.ID, &newMachine.OrderNumber, &newMachine.ModelType, &newMachine.Status, &newMachine.CreatedAt,
	)

	if err != nil {
		http.Error(w, "Failed to insert machine: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Seed the relational tables to test our integration
	db.DB.Exec(`
		INSERT INTO kitting_parts (machine_id, department, part_number, description, qty_required) 
		VALUES ($1, 'assembly', 'PART-100', 'Frame Chassis', 1)
	`, newMachine.ID)
	
	db.DB.Exec(`
		INSERT INTO controls_checkpoints (machine_id, checkpoint_type, description, expected_value)
		VALUES ($1, 'plc_firmware', 'Load v1.2 Firmware', 'v1.2')
	`, newMachine.ID)

	db.DB.Exec(`
		INSERT INTO design_documents (machine_id, document_type, version, file_url)
		VALUES ($1, 'cad_model', 'v1.0.0', 'https://pdm.vtr.internal/models/frame.step')
	`, newMachine.ID)

	BroadcastEvent("machine_created", newMachine)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newMachine)
}

func handleDeleteMachine(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Machine ID is required", http.StatusBadRequest)
		return
	}
	
	_, err := db.DB.Exec("DELETE FROM machines WHERE id = $1", id)
	if err != nil {
		http.Error(w, "Failed to delete machine: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	BroadcastEvent("machine_deleted", map[string]string{"id": id})
	w.WriteHeader(http.StatusOK)
}
