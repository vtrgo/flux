package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/domain/assemblies"
	"github.com/vtrgo/flux/internal/models"
)

func handleGetMachineAssemblies(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	machineID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	tree, err := GetDefaultServer().Assemblies.GetAssemblyTree(r.Context(), machineID)
	if err != nil {
		slog.Error("Failed to fetch machine assembly tree", "machine_id", machineID, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to fetch assembly hierarchy", err)
		return
	}

	if tree == nil {
		tree = []models.MachineAssembly{}
	}
	respondJSON(w, http.StatusOK, tree)
}

func handleGetMachineAssembliesList(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	machineID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	list, err := GetDefaultServer().Assemblies.GetAssemblyList(r.Context(), machineID)
	if err != nil {
		slog.Error("Failed to fetch machine assembly list", "machine_id", machineID, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to fetch assembly list", err)
		return
	}

	if list == nil {
		list = []models.MachineAssembly{}
	}
	respondJSON(w, http.StatusOK, list)
}

func handleCreateMachineAssembly(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	machineID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var req assemblies.CreateAssemblyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}
	req.MachineID = machineID

	created, err := GetDefaultServer().Assemblies.CreateAssembly(r.Context(), req)
	if err != nil {
		if errors.Is(err, assemblies.ErrInvalidAssemblyCode) || errors.Is(err, assemblies.ErrInvalidMachineID) {
			respondError(w, http.StatusBadRequest, err.Error(), err)
			return
		}
		slog.Error("Failed to create assembly", "machine_id", machineID, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to create assembly", err)
		return
	}

	slog.Info("Assembly created", "assembly_id", created.ID, "assembly_code", created.AssemblyCode, "machine_id", machineID)
	respondJSON(w, http.StatusCreated, created)
}

func handleGetAssemblyByID(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assembly ID", err)
		return
	}

	asm, err := GetDefaultServer().Assemblies.GetAssemblyByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, assemblies.ErrAssemblyNotFound) {
			respondError(w, http.StatusNotFound, "Assembly not found", err)
			return
		}
		slog.Error("Failed to get assembly", "assembly_id", id, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to get assembly", err)
		return
	}

	respondJSON(w, http.StatusOK, asm)
}

func handleUpdateAssembly(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assembly ID", err)
		return
	}

	var req assemblies.UpdateAssemblyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	updated, err := GetDefaultServer().Assemblies.UpdateAssembly(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, assemblies.ErrAssemblyNotFound) {
			respondError(w, http.StatusNotFound, "Assembly not found", err)
			return
		}
		if errors.Is(err, assemblies.ErrCircularDependency) {
			respondError(w, http.StatusBadRequest, err.Error(), err)
			return
		}
		slog.Error("Failed to update assembly", "assembly_id", id, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to update assembly", err)
		return
	}

	slog.Info("Assembly updated", "assembly_id", id, "assembly_code", updated.AssemblyCode)
	respondJSON(w, http.StatusOK, updated)
}

func handleDeleteAssembly(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assembly ID", err)
		return
	}

	err = GetDefaultServer().Assemblies.DeleteAssembly(r.Context(), id)
	if err != nil {
		slog.Error("Failed to delete assembly", "assembly_id", id, "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to delete assembly", err)
		return
	}

	slog.Info("Assembly deleted", "assembly_id", id)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Assembly deleted successfully"})
}

func handlePreviewBOMImport(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	machineID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	// Support both multipart form file upload and raw CSV body
	file, _, err := r.FormFile("file")
	var report *models.BOMValidationReport
	var nodes []models.ParsedBOMNode
	if err == nil {
		defer file.Close()
		report, nodes, err = GetDefaultServer().Assemblies.PreviewBOMImport(r.Context(), machineID, file)
	} else {
		// Fallback to reading request body directly
		report, nodes, err = GetDefaultServer().Assemblies.PreviewBOMImport(r.Context(), machineID, r.Body)
	}

	if err != nil {
		slog.Error("Failed to preview BOM import", "machine_id", machineID, "error", err)
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"report": report,
		"nodes":  nodes,
	})
}

func handleCommitBOMImport(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	machineID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	var req struct {
		Nodes []models.ParsedBOMNode `json:"nodes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if err := GetDefaultServer().Assemblies.CommitBOMImport(r.Context(), machineID, req.Nodes); err != nil {
		slog.Error("Failed to commit BOM import", "machine_id", machineID, "error", err)
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	slog.Info("BOM imported successfully", "machine_id", machineID, "nodes_count", len(req.Nodes))
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "BOM imported successfully",
		"nodes_count": len(req.Nodes),
	})
}

func handleAddAssemblyPart(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	assemblyID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assembly ID", err)
		return
	}

	var p models.KittingPart
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}
	p.AssemblyID = &assemblyID

	// Look up assembly to populate machine_id if missing
	if p.MachineID == uuid.Nil {
		asm, err := GetDefaultServer().Assemblies.GetAssemblyByID(r.Context(), assemblyID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Parent assembly not found", err)
			return
		}
		p.MachineID = asm.MachineID
	}

	if err := GetDefaultServer().Assemblies.AddPart(r.Context(), &p); err != nil {
		slog.Error("Failed to add part to assembly", "assembly_id", assemblyID, "error", err)
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	slog.Info("Part added to assembly", "part_number", p.PartNumber, "assembly_id", assemblyID)
	respondJSON(w, http.StatusCreated, p)
}

func handleUpdateKittingPartPick(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	partID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid part ID", err)
		return
	}

	var req struct {
		QtyPicked   int    `json:"qty_picked"`
		FulfilledBy string `json:"fulfilled_by,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Fallback for query param
		if qStr := r.URL.Query().Get("qty_picked"); qStr != "" {
			if q, err := strconv.Atoi(qStr); err == nil {
				req.QtyPicked = q
			}
		}
	}

	updated, err := GetDefaultServer().Assemblies.UpdatePartPick(r.Context(), partID, req.QtyPicked, req.FulfilledBy)
	if err != nil {
		slog.Error("Failed to update kitting part pick", "part_id", partID, "error", err)
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

func handleFulfillTote(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	assemblyID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assembly ID", err)
		return
	}

	var req struct {
		FulfilledBy string `json:"fulfilled_by,omitempty"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.FulfilledBy == "" {
		req.FulfilledBy = r.Header.Get("X-Forwarded-User")
		if req.FulfilledBy == "" {
			req.FulfilledBy = "kitting"
		}
	}

	updated, err := GetDefaultServer().Assemblies.FulfillTote(r.Context(), assemblyID, req.FulfilledBy)
	if err != nil {
		slog.Error("Failed to fulfill assembly tote", "assembly_id", assemblyID, "error", err)
		respondError(w, http.StatusBadRequest, err.Error(), err)
		return
	}

	slog.Info("Assembly tote fulfilled", "assembly_id", assemblyID, "assembly_code", updated.AssemblyCode)
	respondJSON(w, http.StatusOK, updated)
}
