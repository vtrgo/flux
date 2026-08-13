package db

import (
	"os"
	"testing"
)

func TestInitDB(t *testing.T) {
	t.Run("Success_Valid_Connection", func(t *testing.T) {
		connStr := os.Getenv("DATABASE_URL")
		if connStr == "" {
			connStr = "host=/var/run/postgresql dbname=flux sslmode=disable"
		}
		err := InitDB(connStr)
		if err != nil {
			t.Fatalf("Expected successful db connection, got error: %v", err)
		}
		if DB == nil {
			t.Fatal("Expected DB pointer to be initialized, got nil")
		}
		
		// Clean up by closing connection
		DB.Close()
	})

	t.Run("Failure_Invalid_Connection", func(t *testing.T) {
		// Use an invalid host to simulate a connection failure
		invalidConnStr := "host=255.255.255.255 port=5432 user=invalid dbname=invalid connect_timeout=1"
		err := InitDB(invalidConnStr)
		if err == nil {
			t.Fatal("Expected error on invalid db connection, got nil")
		}
	})
}
