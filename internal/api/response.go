package api

import (
	"encoding/json"
	"log"
	"net/http"
)

// respondJSON encodes data to JSON and writes it to the response writer with the specified status code.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("Error encoding JSON response: %v", err)
		}
	}
}

// respondError writes a structured JSON error response.
// Internal errors are logged but not leaked to the client.
func respondError(w http.ResponseWriter, status int, clientMessage string, internalErr error) {
	if internalErr != nil {
		log.Printf("Error (status %d): %v", status, internalErr)
	}
	respondJSON(w, status, map[string]string{"error": clientMessage})
}
