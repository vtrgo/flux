package api

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/logger"
	"github.com/vtrgo/flux/internal/models"
)

type contextKey string

const (
	UserContextKey contextKey = "user"
)

// AuthMiddleware validates the JWT token and extracts the user into the context
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Bypass auth for public API routes and all non-API routes (static files)
		if r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/logout" || !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie("auth_token")
		if err != nil {
			respondError(w, http.StatusUnauthorized, "Missing authentication token", nil)
			return
		}

		tokenStr := cookie.Value
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return GetJWTSecret(), nil
		})

		if err != nil || !token.Valid {
			respondError(w, http.StatusUnauthorized, "Invalid authentication token", nil)
			return
		}

		var user models.User
		err = db.DB.QueryRowContext(r.Context(), `
			SELECT id, username, first_name, last_name, department, role
			FROM users WHERE id = $1
		`, claims.UserID).Scan(&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Department, &user.Role)

		if err != nil {
			respondError(w, http.StatusUnauthorized, "User not found", nil)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}


// RequestLoggerMiddleware logs the method, path, status, and duration of each HTTP request
func RequestLoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Use a custom response writer to capture the status code
		ww := &responseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(ww, r)

		duration := time.Since(start)
		logger.System("HTTP Request",
			slog.String("ip", r.RemoteAddr),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", ww.status),
			slog.String("duration", duration.String()),
		)
	})
}

// PanicRecoveryMiddleware catches panics from handlers, logs the stack trace, and returns a 500
func PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.Error("PANIC RECOVERED",
					slog.Any("error", err),
					slog.String("stack", string(debug.Stack())),
				)
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
