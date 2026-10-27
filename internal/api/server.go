package api

import (
	"database/sql"
	"net/http"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/domain/conc"
	"github.com/vtrgo/flux/internal/domain/ncrs"
	"github.com/vtrgo/flux/internal/domain/rework"
	"github.com/vtrgo/flux/internal/notifications"
)

// Server represents the central HTTP application context with injected services and dependencies
type Server struct {
	DB         *sql.DB
	Hub        *SSEHub
	Dispatcher *notifications.Dispatcher
	CoNC       conc.Service
	NCRs       ncrs.Service
	Rework     rework.Service
}

var defaultServerInstance *Server

// NewServer initializes a new Server instance with dependencies injected
func NewServer(database *sql.DB, hub *SSEHub, dispatcher *notifications.Dispatcher) *Server {
	var concService conc.Service
	var ncrService ncrs.Service
	var reworkService rework.Service
	if database != nil {
		concRepo := conc.NewRepository(database)
		concService = conc.NewService(concRepo)

		ncrRepo := ncrs.NewRepository(database)
		ncrService = ncrs.NewService(ncrRepo)

		reworkRepo := rework.NewRepository(database)
		reworkService = rework.NewService(reworkRepo)
	}

	srv := &Server{
		DB:         database,
		Hub:        hub,
		Dispatcher: dispatcher,
		CoNC:       concService,
		NCRs:       ncrService,
		Rework:     reworkService,
	}
	defaultServerInstance = srv
	return srv
}

// GetDefaultServer returns the active Server instance or constructs one from package singletons
func GetDefaultServer() *Server {
	if defaultServerInstance == nil || (defaultServerInstance.DB == nil && db.DB != nil) {
		defaultServerInstance = NewServer(db.DB, Hub, notifications.GetDispatcher())
	}
	return defaultServerInstance
}

// RegisterRoutes registers all REST and SSE endpoints onto the given ServeMux
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	defaultServerInstance = s
	RegisterRoutes(mux)
}
