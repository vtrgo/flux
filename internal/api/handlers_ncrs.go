package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/vtrgo/flux/internal/domain/ncrs"
	"github.com/vtrgo/flux/internal/models"
)

// generateNextNCRNumber generates the next sequential NCR number in format NCR-YYYY-XXX
func generateNextNCRNumber() (string, error) {
	return GetDefaultServer().NCRs.GetNextNumber(context.Background())
}

// handleGetNCRs fetches all NCR defects with machine and project context
func (s *Server) handleGetNCRs(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	status := r.URL.Query().Get("status")
	machineID := r.URL.Query().Get("machine_id")

	items, err := s.NCRs.ListNCRs(r.Context(), search, status, machineID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query NCRs", err)
		return
	}

	if items == nil {
		items = []models.NCRDetail{}
	}

	respondJSON(w, http.StatusOK, items)
}

func handleGetNCRs(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetNCRs(w, r)
}

// handleGetNextNCRNumber determines the next sequential NCR identifier
func (s *Server) handleGetNextNCRNumber(w http.ResponseWriter, r *http.Request) {
	nextNumber, err := s.NCRs.GetNextNumber(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to determine next NCR number", err)
		return
	}
	respondJSON(w, http.StatusOK, models.NextNCRNumberResponse{NextNumber: nextNumber})
}

func handleGetNextNCRNumber(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetNextNCRNumber(w, r)
}

// handleCreateNCR creates a full Non-Conformance Report tied to a machine
func (s *Server) handleCreateNCR(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MachineID           string  `json:"machine_id"`
		NCRNumber           *string `json:"ncr_number"`
		Assembler           string  `json:"assembler"`
		Location            string  `json:"location"`
		Description         string  `json:"description"`
		Severity            string  `json:"severity"`
		SourceDepartment    string  `json:"source_department"`
		AssignedDepartment  string  `json:"assigned_department"`
		AssignedUserID      *string `json:"assigned_user_id"`
		Notes               *string `json:"notes"`
		DueDate             *string `json:"due_date"`
		RootCause           *string `json:"root_cause"`
		CorrectiveAction    *string `json:"corrective_action"`
		CloseoutDate        *string `json:"closeout_date"`
		TeamLeadSignature   *string `json:"team_lead_signature"`
		SendNotification    bool    `json:"send_notification"`
		UpgradeFromDefectID *string `json:"upgrade_from_defect_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	createReq := ncrs.CreateNCRRequest{
		MachineID:           req.MachineID,
		NCRNumber:           req.NCRNumber,
		Assembler:           req.Assembler,
		Location:            req.Location,
		Description:         req.Description,
		Severity:            req.Severity,
		SourceDepartment:    req.SourceDepartment,
		AssignedDepartment:  req.AssignedDepartment,
		AssignedUserID:      req.AssignedUserID,
		AuthUserID:          authUserID,
		Notes:               req.Notes,
		DueDate:             parsedDueDate,
		CloseoutDate:        parsedCloseoutDate,
		RootCause:           req.RootCause,
		CorrectiveAction:    req.CorrectiveAction,
		TeamLeadSignature:   req.TeamLeadSignature,
		SendNotification:    req.SendNotification,
		UpgradeFromDefectID: req.UpgradeFromDefectID,
		AttachmentsDir:      getAttachmentsDir(),
	}

	res, err := s.NCRs.CreateNCR(r.Context(), createReq)
	if err != nil {
		if errors.Is(err, ncrs.ErrMachineRequired) ||
			errors.Is(err, ncrs.ErrAssemblerRequired) ||
			errors.Is(err, ncrs.ErrLocationRequired) ||
			errors.Is(err, ncrs.ErrDescriptionRequired) ||
			errors.Is(err, ncrs.ErrDescriptionTooLong) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create NCR", err)
		return
	}

	if res.UpdatedOldDefect != nil {
		BroadcastEvent("defect_updated", *res.UpdatedOldDefect)
		slog.Info("Upgraded issue to NCR and marked original issue verified", "old_defect_id", *req.UpgradeFromDefectID, "new_ncr_id", res.NCR.ID, "ncr_number", res.NCR.NCRNumber)
	}

	BroadcastEvent("defect_added", res.NCR.Defect)
	slog.Debug("NCR created", "defect_id", res.NCR.ID, "ncr_number", res.NCR.NCRNumber, "machine_id", req.MachineID)

	if req.SendNotification {
		dispatchDefectNotification(r.Context(), res.NCR.Defect, res.AssignedUserEmail, res.NCR.OrderNumber, res.OpenedByName)
	}

	respondJSON(w, http.StatusCreated, res.NCR)
}

func handleCreateNCR(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleCreateNCR(w, r)
}

// handleUpdateNCR updates NCR details, closeout fields, and status
func (s *Server) handleUpdateNCR(w http.ResponseWriter, r *http.Request) {
	ncrID := r.PathValue("id")
	if ncrID == "" {
		respondError(w, http.StatusBadRequest, "NCR ID is required", nil)
		return
	}

	var req struct {
		Status             *string `json:"status"`
		Assembler          *string `json:"assembler"`
		Location           *string `json:"location"`
		Description        *string `json:"description"`
		Severity           *string `json:"severity"`
		Notes              *string `json:"notes"`
		AssignedDepartment *string `json:"assigned_department"`
		AssignedUserID     *string `json:"assigned_user_id"`
		DueDate            *string `json:"due_date"`
		RootCause          *string `json:"root_cause"`
		CorrectiveAction   *string `json:"corrective_action"`
		CloseoutDate       *string `json:"closeout_date"`
		TeamLeadSignature  *string `json:"team_lead_signature"`
		SendNotification   bool    `json:"send_notification"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", nil)
		return
	}

	parsedDueDate, err := parseDueDate(req.DueDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	parsedCloseoutDate, err := parseDueDate(req.CloseoutDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	authUserID := getAuthenticatedUserID(r)

	updateReq := ncrs.UpdateNCRRequest{
		NCRID:              ncrID,
		Assembler:          req.Assembler,
		Location:           req.Location,
		Description:        req.Description,
		Severity:           req.Severity,
		Notes:              req.Notes,
		AssignedDepartment: req.AssignedDepartment,
		AssignedUserID:     req.AssignedUserID,
		DueDate:            parsedDueDate,
		RootCause:          req.RootCause,
		CorrectiveAction:   req.CorrectiveAction,
		CloseoutDate:       parsedCloseoutDate,
		TeamLeadSignature:  req.TeamLeadSignature,
		Status:             req.Status,
		AuthUserID:         authUserID,
		SendNotification:   req.SendNotification,
	}

	res, err := s.NCRs.UpdateNCR(r.Context(), updateReq)
	if err != nil {
		if errors.Is(err, ncrs.ErrNCRIDRequired) || errors.Is(err, ncrs.ErrDescriptionTooLong) {
			respondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update NCR", err)
		return
	}

	BroadcastEvent("defect_updated", res.NCR.Defect)
	slog.Debug("NCR updated", "defect_id", ncrID, "status", res.NCR.Status)

	if req.SendNotification {
		dispatchDefectNotification(r.Context(), res.NCR.Defect, res.AssignedUserEmail, res.NCR.OrderNumber, res.OpenedByName)
	}

	respondJSON(w, http.StatusOK, res.NCR)
}

func handleUpdateNCR(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleUpdateNCR(w, r)
}
