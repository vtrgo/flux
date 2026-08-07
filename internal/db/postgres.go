package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func InitDB(connStr string) error {
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open db connection: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping db: %w", err)
	}

	log.Println("Database connection successfully established.")
	return nil
}
