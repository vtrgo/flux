package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// AdaptiveCardAction models interactive card actions (e.g., Action.OpenUrl)
type AdaptiveCardAction struct {
	Type  string `json:"type"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

// AdaptiveCardPayload models the Microsoft Teams Adaptive Card format consumed by Power Automate.
type AdaptiveCardPayload struct {
	RecipientEmail string               `json:"recipient_email"`
	IssueURL       string               `json:"issue_url,omitempty"`
	IssueLinkHTML  string               `json:"issue_link_html,omitempty"`
	Type           string               `json:"type"`
	Schema         string               `json:"$schema"`
	Version        string               `json:"version"`
	Body           []AdaptiveCardItem   `json:"body"`
	Actions        []AdaptiveCardAction `json:"actions,omitempty"`
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
	appBaseURL            string
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

	baseURL := cfg.AppBaseURL
	if baseURL == "" {
		baseURL = DefaultAppBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	return &PowerAutomateChannel{
		webhookURL:            cfg.PowerAutomateURL,
		defaultRecipientEmail: cfg.DefaultRecipientEmail,
		appBaseURL:            baseURL,
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

// formatDepartmentName converts an internal department key to human-readable form.
func formatDepartmentName(dept string) string {
	switch strings.ToLower(dept) {
	case "design":
		return "Design"
	case "kitting":
		return "Kitting"
	case "machine_shop":
		return "Machine Shop"
	case "laser":
		return "Laser"
	case "assembly":
		return "Assembly"
	case "electrical_controls", "controls":
		return "Controls"
	case "enclosures":
		return "Enclosures"
	case "quality", "quality_pm", "pm", "project_management":
		return "Quality / PM"
	default:
		return dept
	}
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

	// Resolve issue link and HTML representation
	issueURL := notif.IssueURL
	if issueURL == "" {
		baseURL := c.appBaseURL
		if baseURL == "" {
			baseURL = DefaultAppBaseURL
		}
		if notif.MachineID != uuid.Nil {
			if notif.DefectID != uuid.Nil {
				issueURL = fmt.Sprintf("%s/machine?id=%s&defect_id=%s", baseURL, notif.MachineID, notif.DefectID)
			} else {
				issueURL = fmt.Sprintf("%s/machine?id=%s", baseURL, notif.MachineID)
			}
		} else if notif.DefectID != uuid.Nil {
			issueURL = fmt.Sprintf("%s/quality?defect_id=%s", baseURL, notif.DefectID)
		} else {
			issueURL = fmt.Sprintf("%s/", baseURL)
		}
	}
	issueLinkHTML := fmt.Sprintf(`<a href="%s">View Issue on %s in vtrFlux</a>`, issueURL, machineLabel)

	actions := []AdaptiveCardAction{
		{
			Type:  "Action.OpenUrl",
			Title: "View Issue in vtrFlux",
			URL:   issueURL,
		},
	}

	if notif.IsNCR {
		headerText := fmt.Sprintf("⚠️ NON-CONFORMANCE REPORT (NCR) - %s", machineLabel)
		if notif.NCRNumber != "" {
			headerText = fmt.Sprintf("⚠️ NON-CONFORMANCE REPORT: %s (Machine: %s)", notif.NCRNumber, machineLabel)
		}

		facts := []AdaptiveCardFact{
			{
				Title: "Notification Type:",
				Value: "Non-Conformance Report (NCR)",
			},
		}
		if notif.NCRNumber != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "NCR Identification #:",
				Value: notif.NCRNumber,
			})
		}
		facts = append(facts,
			AdaptiveCardFact{Title: "Machine ID:", Value: machineLabel},
			AdaptiveCardFact{Title: "Opened By:", Value: openedBy},
			AdaptiveCardFact{Title: "Date Opened:", Value: dateOpenedStr},
		)
		if notif.Status != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "NCR Status:",
				Value: strings.ToUpper(notif.Status),
			})
		}
		if notif.Location != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Location of NC:",
				Value: notif.Location,
			})
		}
		if notif.Assembler != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Assembler:",
				Value: notif.Assembler,
			})
		}
		if notif.TeamLeadSignature != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Assigned Responsible:",
				Value: notif.TeamLeadSignature,
			})
		}
		if dueDateStr != "None" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Target Due Date:",
				Value: dueDateStr,
			})
		}
		if notif.RootCause != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Root Cause:",
				Value: notif.RootCause,
			})
		}
		if notif.CorrectiveAction != "" {
			facts = append(facts, AdaptiveCardFact{
				Title: "Corrective Action:",
				Value: notif.CorrectiveAction,
			})
		}
		facts = append(facts, AdaptiveCardFact{
			Title: "Issue Link:",
			Value: fmt.Sprintf("[%s](%s)", issueURL, issueURL),
		})

		body := []AdaptiveCardItem{
			{
				Type:   "TextBlock",
				Text:   headerText,
				Weight: "Bolder",
				Size:   "Medium",
			},
			{
				Type: "TextBlock",
				Text: fmt.Sprintf("**NCR Non-Conformance Details:**\n%s", notif.Description),
				Wrap: true,
			},
			{
				Type:  "FactSet",
				Facts: facts,
			},
		}

		return AdaptiveCardPayload{
			RecipientEmail: recipient,
			IssueURL:       issueURL,
			IssueLinkHTML:  issueLinkHTML,
			Type:           "AdaptiveCard",
			Schema:         "http://adaptivecards.io/schemas/adaptive-card.json",
			Version:        "1.2",
			Body:           body,
			Actions:        actions,
		}
	}

	facts := []AdaptiveCardFact{
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
	}

	assignee := notif.AssigneeName
	if assignee == "" {
		if notif.AssignedDept != "" {
			assignee = fmt.Sprintf("%s (Unassigned)", formatDepartmentName(notif.AssignedDept))
		} else {
			assignee = "Unassigned"
		}
	}
	facts = append(facts, AdaptiveCardFact{
		Title: "Assignee:",
		Value: assignee,
	})

	if notif.AssignedDept != "" {
		facts = append(facts, AdaptiveCardFact{
			Title: "Department:",
			Value: formatDepartmentName(notif.AssignedDept),
		})
	}
	if notif.Severity != "" {
		facts = append(facts, AdaptiveCardFact{
			Title: "Severity:",
			Value: strings.ToUpper(notif.Severity),
		})
	}
	if notif.Status != "" {
		facts = append(facts, AdaptiveCardFact{
			Title: "Status:",
			Value: strings.ToUpper(notif.Status),
		})
	}
	facts = append(facts, AdaptiveCardFact{
		Title: "Issue Link:",
		Value: fmt.Sprintf("[%s](%s)", issueURL, issueURL),
	})

	body := []AdaptiveCardItem{
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
	}

	if strings.TrimSpace(notif.Notes) != "" {
		body = append(body, AdaptiveCardItem{
			Type: "TextBlock",
			Text: fmt.Sprintf("**Detailed Notes:**\n%s", strings.TrimSpace(notif.Notes)),
			Wrap: true,
		})
	}

	body = append(body, AdaptiveCardItem{
		Type:  "FactSet",
		Facts: facts,
	})

	return AdaptiveCardPayload{
		RecipientEmail: recipient,
		IssueURL:       issueURL,
		IssueLinkHTML:  issueLinkHTML,
		Type:           "AdaptiveCard",
		Schema:         "http://adaptivecards.io/schemas/adaptive-card.json",
		Version:        "1.2",
		Body:           body,
		Actions:        actions,
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
