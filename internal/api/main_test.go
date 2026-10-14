package api

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	// Strictly disable live Teams / Power Automate notifications during all test suites
	_ = os.Setenv("NOTIFICATIONS_ENABLED", "false")
	_ = os.Setenv("POWER_AUTOMATE_WEBHOOK_URL", "")

	os.Exit(m.Run())
}
