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
	"github.com/vtrgo/flux/internal/models"
)

// DefaultFallbackTimezone is used if no setting is found in the database
const DefaultFallbackTimezone = "America/Toronto"

var PredefinedTimezones = []models.TimezoneOption{
	{ID: "America/Toronto", Name: "Eastern Time (Toronto, Montreal)", Region: "North America"},
	{ID: "America/New_York", Name: "Eastern Time (New York, Boston, Miami)", Region: "North America"},
	{ID: "America/Chicago", Name: "Central Time (Chicago, Dallas, Winnipeg)", Region: "North America"},
	{ID: "America/Denver", Name: "Mountain Time (Denver, Calgary, Salt Lake City)", Region: "North America"},
	{ID: "America/Phoenix", Name: "Mountain Standard Time (Arizona, No DST)", Region: "North America"},
	{ID: "America/Los_Angeles", Name: "Pacific Time (Los Angeles, Seattle, San Francisco)", Region: "North America"},
	{ID: "America/Vancouver", Name: "Pacific Time (Vancouver)", Region: "North America"},
	{ID: "America/Anchorage", Name: "Alaska Time (Anchorage)", Region: "North America"},
	{ID: "Pacific/Honolulu", Name: "Hawaii-Aleutian Time (Honolulu, No DST)", Region: "North America"},
	{ID: "America/Halifax", Name: "Atlantic Time (Halifax)", Region: "North America"},
	{ID: "America/St_Johns", Name: "Newfoundland Time (St. John's)", Region: "North America"},
	{ID: "Europe/London", Name: "Greenwich Mean Time / BST (London, Dublin)", Region: "Europe"},
	{ID: "Europe/Paris", Name: "Central European Time (Paris, Madrid, Amsterdam)", Region: "Europe"},
	{ID: "Europe/Berlin", Name: "Central European Time (Berlin, Frankfurt, Zurich)", Region: "Europe"},
	{ID: "Europe/Athens", Name: "Eastern European Time (Athens, Bucharest, Helsinki)", Region: "Europe"},
	{ID: "Asia/Tokyo", Name: "Japan Standard Time (Tokyo, Osaka)", Region: "Asia / Pacific"},
	{ID: "Asia/Hong_Kong", Name: "Hong Kong Time", Region: "Asia / Pacific"},
	{ID: "Asia/Singapore", Name: "Singapore Standard Time", Region: "Asia / Pacific"},
	{ID: "Australia/Sydney", Name: "Australian Eastern Time (Sydney, Melbourne)", Region: "Asia / Pacific"},
	{ID: "Australia/Perth", Name: "Australian Western Time (Perth)", Region: "Asia / Pacific"},
	{ID: "Pacific/Auckland", Name: "New Zealand Time (Auckland, Wellington)", Region: "Asia / Pacific"},
	{ID: "UTC", Name: "UTC (Coordinated Universal Time)", Region: "Universal"},
}

// handleGetTimezone retrieves the active site-wide timezone setting
func handleGetTimezone(w http.ResponseWriter, r *http.Request) {
	var timezone string
	err := db.DB.QueryRowContext(r.Context(), `
		SELECT value FROM system_settings WHERE key = 'timezone'
	`).Scan(&timezone)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			timezone = DefaultFallbackTimezone
		} else {
			respondError(w, http.StatusInternalServerError, "Failed to retrieve timezone setting", err)
			return
		}
	}

	respondJSON(w, http.StatusOK, models.TimezoneResponse{Timezone: timezone})
}

// handleGetAvailableTimezones returns the predefined list of supported timezones with dynamic offsets
func handleGetAvailableTimezones(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	options := make([]models.TimezoneOption, len(PredefinedTimezones))
	copy(options, PredefinedTimezones)

	for i := range options {
		loc, err := time.LoadLocation(options[i].ID)
		if err == nil {
			_, offsetSec := now.In(loc).Zone()
			hours := offsetSec / 3600
			mins := (offsetSec % 3600) / 60
			if mins < 0 {
				mins = -mins
			}
			options[i].Offset = fmt.Sprintf("UTC%+03d:%02d", hours, mins)
		} else {
			options[i].Offset = "UTC"
		}
	}

	respondJSON(w, http.StatusOK, options)
}

// handleUpdateTimezone updates the site-wide timezone setting (admin only)
func handleUpdateTimezone(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateTimezoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.Timezone == "" {
		respondError(w, http.StatusBadRequest, "Timezone cannot be empty", nil)
		return
	}

	// Validate against standard IANA timezone database
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("Invalid timezone identifier: %s", req.Timezone), err)
		return
	}

	// Upsert setting in system_settings table
	_, err := db.DB.ExecContext(r.Context(), `
		INSERT INTO system_settings (key, value, updated_at)
		VALUES ('timezone', $1, CURRENT_TIMESTAMP)
		ON CONFLICT (key) DO UPDATE
		SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
	`, req.Timezone)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update timezone setting", err)
		return
	}

	slog.Info("Site-wide timezone updated", "timezone", req.Timezone)

	resp := models.TimezoneResponse(req)

	// Broadcast SSE event so all connected clients update dynamically
	BroadcastEvent("timezone_updated", resp)

	respondJSON(w, http.StatusOK, resp)
}
