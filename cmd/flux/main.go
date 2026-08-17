package main

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vtrgo/flux"
	"github.com/vtrgo/flux/internal/api"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/logger"
)

func main() {
	// Initialize our dual-handler slog configuration
	logger.InitLogger()
	
	// Hook the log output to our SSE broadcaster
	logger.LogBroadcaster = func(data interface{}) {
		api.BroadcastEvent("server_log_entry", data)
	}

	slog.Info("Starting vtrFlux API Server...")

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "host=/var/run/postgresql dbname=flux sslmode=disable"
	}

	if err := db.InitDB(connStr); err != nil {
		slog.Error("Failed to initialize database", "error", err)
		os.Exit(1)
	}
	defer func() {
		slog.Info("Closing database connections...")
		db.DB.Close()
	}()

	api.InitHub()

	mux := http.NewServeMux()
	api.RegisterRoutes(mux)

	uiFS, err := fs.Sub(flux.UIFS, "frontend/out")
	if err != nil {
		slog.Error("Failed to initialize embedded UI filesystem", "error", err)
		os.Exit(1)
	}
	mux.Handle("/", http.FileServer(http.FS(uiFS)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Chain middlewares: Logger -> PanicRecovery -> CORS -> Router
	handler := api.RequestLoggerMiddleware(
		api.PanicRecoveryMiddleware(
			api.CorsMiddleware(mux),
		),
	)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}

	go func() {
		slog.Info("vtrFlux API Server listening", "port", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	slog.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("Server exiting")
}
