package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// AdaptiveCardPayload models the Microsoft Teams Adaptive Card format consumed by Power Automate.
type AdaptiveCardPayload struct {
	RecipientEmail string             `json:"recipient_email"`
	Type           string             `json:"type"`
	Schema         string             `json:"$schema"`
	Version        string             `json:"version"`
	Body           []AdaptiveCardItem `json:"body"`
}

// AdaptiveCardItem models body elements (TextBlock, FactSet)
type AdaptiveCardItem struct {
	Type   string             `json:"type"`
	Text   string             `json:"text,omitempty"`
	Weight string             `json:"weight,omitempty"`
	Size   string             `json:"size,omitempty"`
	Wrap   bool               `json:"wrap,omitempty"`
	Facts  []AdaptiveCardFact `json:"facts,omitempty"`
}

// AdaptiveCardFact represents a key-value fact in a FactSet
type AdaptiveCardFact struct {
	Title string `json:"title"`
	Value string `json:"value"`
}

// PowerAutomateChannel dispatches Adaptive Cards to Microsoft Power Automate HTTP trigger endpoints.
type PowerAutomateChannel struct {
	webhookURL            string
	defaultRecipientEmail string
	enabled               bool
	client                *http.Client
}

// NewPowerAutomateChannel creates an instance of the Power Automate notification channel.
func NewPowerAutomateChannel(cfg Config, client *http.Client) *PowerAutomateChannel {
	if client == nil {
		client = &http.Client{
			Timeout: 10 * time.Second,
		}
	}

	return &PowerAutomateChannel{
		webhookURL:            cfg.PowerAutomateURL,
		defaultRecipientEmail: cfg.DefaultRecipientEmail,
		enabled:               cfg.Enabled,
		client:                client,
	}
}

// Name returns the identifier for this channel.
func (c *PowerAutomateChannel) Name() string {
	return "power_automate"
}

// IsEnabled indicates whether this channel is configured and active.
func (c *PowerAutomateChannel) IsEnabled() bool {
	return c.enabled && c.webhookURL != ""
}

// BuildAdaptiveCard constructs the Adaptive Card payload from an issue notification.
func (c *PowerAutomateChannel) BuildAdaptiveCard(notif IssueNotification) AdaptiveCardPayload {
	recipient := notif.RecipientEmail
	if recipient == "" {
		recipient = c.defaultRecipientEmail
	}

	// Resolve timezone for date formatting
	loc, err := time.LoadLocation(notif.Timezone)
	if err != nil {
		loc = time.UTC
	}

	dateOpenedStr := notif.DateOpened.In(loc).Format("2006-01-02 15:04 MST")
	dueDateStr := "None"
	if notif.DueDate != nil && !notif.DueDate.IsZero() {
		dueDateStr = notif.DueDate.In(loc).Format("2006-01-02 15:04 MST")
	}

	machineLabel := notif.MachineNumber
	if machineLabel == "" {
		machineLabel = "Unassigned"
	}

	openedBy := notif.OpenedByName
	if openedBy == "" {
		openedBy = "System"
	}

	return AdaptiveCardPayload{
		RecipientEmail: recipient,
		Type:           "AdaptiveCard",
		Schema:         "http://adaptivecards.io/schemas/adaptive-card.json",
		Version:        "1.2",
		Body: []AdaptiveCardItem{
			{
				Type:   "TextBlock",
				Text:   fmt.Sprintf("vtrFlux Machine ID: %s", machineLabel),
				Weight: "Bolder",
				Size:   "Medium",
			},
			{
				Type: "TextBlock",
				Text: notif.Description,
				Wrap: true,
			},
			{
				Type: "FactSet",
				Facts: []AdaptiveCardFact{
					{
						Title: "Machine ID:",
						Value: machineLabel,
					},
					{
						Title: "Opened By:",
						Value: openedBy,
					},
					{
						Title: "Date Opened:",
						Value: dateOpenedStr,
					},
					{
						Title: "Due Date:",
						Value: dueDateStr,
					},
				},
			},
		},
	}
}

// SendIssueNotification sends the Adaptive Card to the Power Automate endpoint via HTTP POST,
// automatically retrying on transient HTTP or connection failures.
func (c *PowerAutomateChannel) SendIssueNotification(ctx context.Context, notif IssueNotification) error {
	if !c.IsEnabled() {
		slog.Debug("PowerAutomateChannel is disabled; skipping notification", "defect_id", notif.DefectID)
		return nil
	}

	card := c.BuildAdaptiveCard(notif)
	payloadBytes, err := json.Marshal(card)
	if err != nil {
		return fmt.Errorf("failed to marshal AdaptiveCard payload: %w", err)
	}

	slog.Info("Sending issue notification to Power Automate",
		"defect_id", notif.DefectID,
		"machine_number", notif.MachineNumber,
		"recipient_email", card.RecipientEmail,
	)

	const maxRetries = 2
	var lastErr error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*500) * time.Millisecond
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			slog.Info("Retrying Power Automate request", "attempt", attempt, "defect_id", notif.DefectID)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.webhookURL, bytes.NewReader(payloadBytes))
		if err != nil {
			return fmt.Errorf("failed to create Power Automate HTTP request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("power automate request failed: %w", err)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			slog.Info("Successfully delivered issue notification to Power Automate",
				"defect_id", notif.DefectID,
				"status_code", resp.StatusCode,
			)
			return nil
		}

		lastErr = fmt.Errorf("power automate returned status %d: %s", resp.StatusCode, string(body))
		slog.Warn("Power Automate call returned non-2xx status code",
			"status_code", resp.StatusCode,
			"response_body", string(body),
			"defect_id", notif.DefectID,
			"attempt", attempt,
		)

		// Only retry transient status codes (rate limits or server errors)
		if resp.StatusCode != http.StatusTooManyRequests &&
			resp.StatusCode != http.StatusBadGateway &&
			resp.StatusCode != http.StatusServiceUnavailable &&
			resp.StatusCode != http.StatusGatewayTimeout {
			break
		}
	}

	return lastErr
}
