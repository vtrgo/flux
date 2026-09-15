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

// isPublicRoute determines if an incoming HTTP request is permitted without authentication.
func isPublicRoute(r *http.Request) bool {
	path := r.URL.Path

	// Bypass auth for all non-API routes (static files, Next.js assets)
	if !strings.HasPrefix(path, "/api/") {
		return true
	}

	// Always public: auth login and logout
	if path == "/api/auth/login" || path == "/api/auth/logout" {
		return true
	}

	// Safe read-only endpoints (GET / HEAD) for public displays (/display kiosk), health checks, and SSE
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		switch path {
		case "/api/system/version",
			"/api/system/timezone",
			"/api/system/timezones",
			"/api/sse",
			"/api/sales_orders",
			"/api/machines",
			"/api/defects/project_summary",
			"/api/defects/summary",
			"/api/defects/machine_summary",
			"/api/defects/project_department_summary":
			return true
		}
	}

	return false
}

// AuthMiddleware validates the JWT token and extracts the user into the context.
// For public routes, authentication is optional: if a valid auth token is present,
// the user context is populated; otherwise the request continues unauthenticated.
// For private routes, a valid auth token is strictly required.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isPublic := isPublicRoute(r)

		cookie, err := r.Cookie("auth_token")
		if err != nil {
			if isPublic {
				next.ServeHTTP(w, r)
				return
			}
			respondError(w, http.StatusUnauthorized, "Missing authentication token", nil)
			return
		}

		tokenStr := cookie.Value
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return GetJWTSecret(), nil
		})

		if err != nil || !token.Valid {
			if isPublic {
				next.ServeHTTP(w, r)
				return
			}
			respondError(w, http.StatusUnauthorized, "Invalid authentication token", nil)
			return
		}

		var user models.User
		err = db.DB.QueryRowContext(r.Context(), `
			SELECT id, username, first_name, last_name, department, role
			FROM users WHERE id = $1
		`, claims.UserID).Scan(&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Department, &user.Role)

		if err != nil {
			if isPublic {
				next.ServeHTTP(w, r)
				return
			}
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

// RequireRole returns a middleware that strictly requires the user to have one of the specified roles.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := r.Context().Value(UserContextKey).(*models.User)
			if !ok || user == nil {
				respondError(w, http.StatusUnauthorized, "Unauthorized", nil)
				return
			}

			if user.Role == nil {
				respondError(w, http.StatusForbidden, "Forbidden: No role assigned", nil)
				return
			}

			userRole := strings.ToLower(*user.Role)
			authorized := false
			for _, role := range allowedRoles {
				if userRole == strings.ToLower(role) {
					authorized = true
					break
				}
			}

			if !authorized {
				respondError(w, http.StatusForbidden, "Forbidden: Insufficient privileges", nil)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
