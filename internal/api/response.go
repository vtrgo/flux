package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// respondJSON encodes data to JSON and writes it to the response writer with the specified status code.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			slog.Error("Failed to encode JSON response", "error", err)
		}
	}
}

// respondError writes a structured JSON error response.
// Internal errors are logged but not leaked to the client.
func respondError(w http.ResponseWriter, status int, clientMessage string, internalErr error) {
	if internalErr != nil {
		slog.Error("HTTP error response", "status", status, "error", internalErr)
	}
	respondJSON(w, status, map[string]string{"error": clientMessage})
}
