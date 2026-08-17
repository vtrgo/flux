package main

import (
	"context"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vtrgo/flux"
	"github.com/vtrgo/flux/internal/api"
	"github.com/vtrgo/flux/internal/db"
)

func main() {
	log.Println("Starting vtrFlux API Server...")

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "host=/var/run/postgresql dbname=flux sslmode=disable"
	}

	if err := db.InitDB(connStr); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer func() {
		log.Println("Closing database connections...")
		db.DB.Close()
	}()

	api.InitHub()

	mux := http.NewServeMux()
	api.RegisterRoutes(mux)

	uiFS, err := fs.Sub(flux.UIFS, "frontend/out")
	if err != nil {
		log.Fatalf("Failed to initialize embedded UI filesystem: %v", err)
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
		log.Printf("vtrFlux API Server listening on :%s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}
