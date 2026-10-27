package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/domain/conc"
)

func parseHourlyRate(r *http.Request) float64 {
	rateStr := r.URL.Query().Get("hourly_rate")
	if rateStr != "" {
		if rate, err := strconv.ParseFloat(rateStr, 64); err == nil && rate > 0 {
			return rate
		}
	}
	return conc.DefaultBurdenHourlyRate
}

// handleGetCostOfNonConformanceSummary computes executive shop-wide Cost of Non-Conformance metrics
func (s *Server) handleGetCostOfNonConformanceSummary(w http.ResponseWriter, r *http.Request) {
	hourlyRate := parseHourlyRate(r)
	salesOrderID := r.URL.Query().Get("sales_order_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	resp, err := s.CoNC.GetSummary(r.Context(), hourlyRate, salesOrderID, startDate, endDate)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute CoNC totals", err)
		return
	}

	slog.Debug("CoNC summary generated", "total_conc_hours", resp.TotalCoNCHours, "total_conc_cost", resp.TotalCoNCCost, "hourly_rate", hourlyRate)
	respondJSON(w, http.StatusOK, resp)
}

func handleGetCostOfNonConformanceSummary(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetCostOfNonConformanceSummary(w, r)
}

// handleGetMachineCostOfNonConformance computes machine-specific Cost of Non-Conformance details
func (s *Server) handleGetMachineCostOfNonConformance(w http.ResponseWriter, r *http.Request) {
	machineIDStr := r.PathValue("id")
	machineID, err := uuid.Parse(machineIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid machine ID", err)
		return
	}

	hourlyRate := parseHourlyRate(r)

	resp, err := s.CoNC.GetMachineDetail(r.Context(), machineID, hourlyRate)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "Machine not found", nil)
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to fetch machine info", err)
		return
	}

	slog.Debug("Machine CoNC generated", "machine_id", machineID, "conc_hours", resp.TotalCoNCHours, "conc_cost", resp.TotalCoNCCost)
	respondJSON(w, http.StatusOK, resp)
}

func handleGetMachineCostOfNonConformance(w http.ResponseWriter, r *http.Request) {
	GetDefaultServer().handleGetMachineCostOfNonConformance(w, r)
}
