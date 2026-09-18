package notifications

import (
	"os"
	"strings"
)

const (
	// DefaultPowerAutomateWebhookURL is the verified Power Automate direct trigger endpoint
	DefaultPowerAutomateWebhookURL = "https://default33bdd1cd37e94c64944429dc67161b.c1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/31/workflows/847277835cb94c00b4bb70bd9451b4c8/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=O6HMW1Xu_h7O2nlHl6a0-wOp78x6J6xKVf4qh2BKtZg"

	// DefaultNotificationRecipientEmail is the fallback recipient when no assignee email is available
	DefaultNotificationRecipientEmail = "justin@vtrfeedersolutions.com"
)

// Config represents runtime configuration for notification channels
type Config struct {
	Enabled               bool
	PowerAutomateURL      string
	DefaultRecipientEmail string
}

// LoadConfigFromEnv populates configuration from environment variables with sensible defaults
func LoadConfigFromEnv() Config {
	enabled := true
	if val := os.Getenv("NOTIFICATIONS_ENABLED"); val != "" {
		lower := strings.ToLower(strings.TrimSpace(val))
		if lower == "false" || lower == "0" || lower == "no" {
			enabled = false
		}
	}

	powerAutomateURL := os.Getenv("POWER_AUTOMATE_WEBHOOK_URL")
	if powerAutomateURL == "" {
		powerAutomateURL = DefaultPowerAutomateWebhookURL
	}

	defaultEmail := os.Getenv("DEFAULT_NOTIFICATION_RECIPIENT_EMAIL")
	if defaultEmail == "" {
		defaultEmail = DefaultNotificationRecipientEmail
	}

	return Config{
		Enabled:               enabled,
		PowerAutomateURL:      powerAutomateURL,
		DefaultRecipientEmail: defaultEmail,
	}
}
