package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/domain/rework"
	"github.com/vtrgo/flux/internal/models"
)

// handleGetReworkItems fetches rework items with rich joins on sales orders, machines, and users
func (s *Server) handleGetReworkItems(w http.ResponseWriter, r *http.Request) {
	salesOrderID := r.URL.Query().Get("sales_order_id")
	machineID := r.URL.Query().Get("machine_id")
	status := r.URL.Query().Get("status")
	view := r.URL.Query().Get("view")
	partType := r.URL.Query().Get("part_type")

	items, err := s.Rework.GetReworkItems(r.Context(), salesOrderID, machineID, status, view, partType)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	if items == nil {
		items = []models.ReworkItem{}
	}

	respondJSON(w, http.StatusOK, items)
}

func handleGetReworkItems(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetReworkItems(w, r)
}

// handleGetReworkItemByID returns a single rework item
func (s *Server) handleGetReworkItemByID(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rework ID", err)
		return
	}

	item, err := s.Rework.GetReworkItemByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Rework item not found", err)
			return
		}
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	respondJSON(w, http.StatusOK, item)
}

func handleGetReworkItemByID(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetReworkItemByID(w, r)
}

// handleCreateReworkItem creates a new rework ticket
func (s *Server) handleCreateReworkItem(w http.ResponseWriter, r *http.Request) {
	var req rework.CreateReworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	req.AuthUserID = getAuthenticatedUserID(r)

	res, err := s.Rework.CreateReworkItem(r.Context(), req)
	if err != nil {
		if errors.Is(err, rework.ErrRequiredFields) ||
			errors.Is(err, rework.ErrInvalidPartType) ||
			errors.Is(err, rework.ErrSalesOrderRequired) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create rework item", err)
		return
	}

	slog.Info("Rework item created", "rework_id", res.Item.ID, "project_number", res.Item.ProjectNumber, "part_type", res.Item.PartType)

	BroadcastEvent("rework_created", res.Item)

	if res.UpdatedDefect != nil {
		BroadcastEvent("defect_updated", *res.UpdatedDefect)
	}

	respondJSON(w, http.StatusCreated, res.Item)
}

func handleCreateReworkItem(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateReworkItem(w, r)
}

// handleUpdateReworkItem updates fields as component moves across departments
func (s *Server) handleUpdateReworkItem(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	var req rework.UpdateReworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	req.AuthUserID = getAuthenticatedUserID(r)

	res, err := s.Rework.UpdateReworkItem(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, rework.ErrReworkNotFound) {
			respondError(w, http.StatusNotFound, "Rework item not found", err)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update rework item", err)
		return
	}

	if res.UpdatedDefect != nil {
		BroadcastEvent("defect_updated", *res.UpdatedDefect)
		slog.Info("Cascaded rework completion to linked defect", "rework_id", res.Item.ID, "defect_id", res.UpdatedDefect.ID, "part_number", res.Item.PartNumber)
	}

	if res.Item.Status == "complete" {
		BroadcastEvent("rework_completed", res.Item)
	} else {
		BroadcastEvent("rework_updated", res.Item)
	}

	respondJSON(w, http.StatusOK, res.Item)
}

func handleUpdateReworkItem(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleUpdateReworkItem(w, r)
}

// handleAfterHoursDrop logs physical handoff outside regular shop hours
func (s *Server) handleAfterHoursDrop(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	var req struct {
		PartGivenToOrLeftAt     string `json:"part_given_to_or_left_at"`
		IsAssemblerSelfModified bool   `json:"is_assembler_self_modified"`
		DropNote                string `json:"drop_note"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.PartGivenToOrLeftAt == "" {
		respondError(w, http.StatusBadRequest, "Handoff destination is required (e.g. 'Justin desk')", nil)
		return
	}

	item, err := s.Rework.AfterHoursDrop(r.Context(), id, req.PartGivenToOrLeftAt, req.IsAssemblerSelfModified, req.DropNote)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to register drop", err)
		return
	}

	BroadcastEvent("rework_after_hours_drop", item)
	respondJSON(w, http.StatusOK, item)
}

func handleAfterHoursDrop(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleAfterHoursDrop(w, r)
}

// handleDeleteReworkItem removes a rework ticket
func (s *Server) handleDeleteReworkItem(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Rework ID is required", nil)
		return
	}

	if err := s.Rework.DeleteReworkItem(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete item", err)
		return
	}

	BroadcastEvent("rework_deleted", map[string]string{"id": id.String()})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func handleDeleteReworkItem(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleDeleteReworkItem(w, r)
}

// handleGetProjectReworkSummary calculates high-level rework metrics for a sales order
func (s *Server) handleGetProjectReworkSummary(w http.ResponseWriter, r *http.Request) {
	salesOrderIDStr := r.PathValue("id")
	salesOrderID, err := uuid.Parse(salesOrderIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Sales Order ID is required", nil)
		return
	}

	summary, err := s.Rework.GetProjectReworkSummary(r.Context(), salesOrderID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	respondJSON(w, http.StatusOK, summary)
}

func handleGetProjectReworkSummary(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetProjectReworkSummary(w, r)
}

// handleGetMachineFATReadiness inspects blockers prior to FAT or shipping
func (s *Server) handleGetMachineFATReadiness(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Machine ID is required", nil)
		return
	}

	readiness, err := s.Rework.GetMachineFATReadiness(r.Context(), machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database error", err)
		return
	}

	respondJSON(w, http.StatusOK, readiness)
}

func handleGetMachineFATReadiness(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMachineFATReadiness(w, r)
}

// handleGetControlsSchematicReworks returns master schematic redlines
func (s *Server) handleGetControlsSchematicReworks(w http.ResponseWriter, r *http.Request) {
	salesOrderID := r.URL.Query().Get("sales_order_id")
	machineID := r.URL.Query().Get("machine_id")

	items, err := s.Rework.GetControlsSchematics(r.Context(), salesOrderID, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch schematic redlines", err)
		return
	}

	if items == nil {
		items = []models.ControlsSchematicRework{}
	}

	respondJSON(w, http.StatusOK, items)
}

func handleGetControlsSchematicReworks(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetControlsSchematicReworks(w, r)
}

// handleCreateControlsSchematicRework creates a schematic redline
func (s *Server) handleCreateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SalesOrderID        string  `json:"sales_order_id"`
		MachineID           string  `json:"machine_id"`
		SchematicNumber     string  `json:"schematic_number"`
		MasterCopyRedlined  bool    `json:"master_copy_redlined"`
		RedlinesDescription *string `json:"redlines_description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.MachineID == "" || req.SchematicNumber == "" {
		respondError(w, http.StatusBadRequest, "Machine ID and schematic number are required", nil)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	scReq := rework.CreateControlsSchematicRequest{
		SalesOrderID:        req.SalesOrderID,
		MachineID:           req.MachineID,
		SchematicNumber:     req.SchematicNumber,
		MasterCopyRedlined:  req.MasterCopyRedlined,
		RedlinesDescription: req.RedlinesDescription,
		AuthUserID:          authUserID,
	}

	newID, err := s.Rework.CreateControlsSchematic(r.Context(), scReq)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to record controls schematic rework", err)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{"id": newID, "status": "created"})
}

func handleCreateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateControlsSchematicRework(w, r)
}

// handleUpdateControlsSchematicRework updates a schematic redline or signs off
func (s *Server) handleUpdateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "ID is required", nil)
		return
	}

	var req struct {
		MasterCopyRedlined         *bool   `json:"master_copy_redlined"`
		RedlinesDescription        *string `json:"redlines_description"`
		SchematicsDigitallyUpdated *bool   `json:"schematics_digitally_updated"`
		ChecklistSignedOff         *bool   `json:"checklist_signed_off"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	scReq := rework.UpdateControlsSchematicRequest{
		ID:                         id,
		MasterCopyRedlined:         req.MasterCopyRedlined,
		RedlinesDescription:        req.RedlinesDescription,
		SchematicsDigitallyUpdated: req.SchematicsDigitallyUpdated,
		ChecklistSignedOff:         req.ChecklistSignedOff,
		AuthUserID:                 authUserID,
	}

	if err := s.Rework.UpdateControlsSchematic(r.Context(), scReq); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update controls schematic rework", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated", "id": id})
}

func handleUpdateControlsSchematicRework(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleUpdateControlsSchematicRework(w, r)
}
