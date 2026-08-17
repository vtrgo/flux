package api

import (
	"log"
	"net/http"
	"runtime/debug"
	"time"
)

// RequestLoggerMiddleware logs the method, path, status, and duration of each HTTP request
func RequestLoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Use a custom response writer to capture the status code
		ww := &responseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(ww, r)

		duration := time.Since(start)
		log.Printf("[%s] %s %s - %d %s", r.RemoteAddr, r.Method, r.URL.Path, ww.status, duration)
	})
}

// PanicRecoveryMiddleware catches panics from handlers, logs the stack trace, and returns a 500
func PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC RECOVERED: %v\n%s", err, debug.Stack())
				respondError(w, http.StatusInternalServerError, "Internal server error", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// responseWriter wraps http.ResponseWriter to capture the HTTP status code
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// Flush implements the http.Flusher interface to support Server-Sent Events (SSE).
func (rw *responseWriter) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}
