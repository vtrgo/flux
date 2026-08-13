package main

import (
	"io/fs"
	"log"
	"net/http"
	"os"

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

	handler := api.CorsMiddleware(mux)

	log.Printf("vtrFlux API Server listening on :%s\n", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
