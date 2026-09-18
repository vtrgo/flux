package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPowerAutomateChannel_BuildAdaptiveCard(t *testing.T) {
	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      "http://example.com/webhook",
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
	}
	channel := NewPowerAutomateChannel(cfg, nil)

	dueDate := time.Date(2026, 9, 18, 21, 0, 0, 0, time.UTC) // 17:00 EDT
	dateOpened := time.Date(2026, 9, 16, 18, 28, 0, 0, time.UTC) // 14:28 EDT

	notif := IssueNotification{
		DefectID:       uuid.New(),
		MachineID:      uuid.New(),
		MachineNumber:  "25-115G",
		Description:    "Defect brief description goes here.",
		Severity:       "critical",
		AssignedDept:   "electrical_controls",
		RecipientEmail: "lucas@vtrfeedersolutions.com",
		OpenedByName:   "Lucas Rettore",
		DateOpened:     dateOpened,
		DueDate:        &dueDate,
		Timezone:       "America/Toronto",
	}

	card := channel.BuildAdaptiveCard(notif)

	if card.RecipientEmail != "lucas@vtrfeedersolutions.com" {
		t.Errorf("expected recipient lucas@vtrfeedersolutions.com, got %s", card.RecipientEmail)
	}
	if card.Type != "AdaptiveCard" {
		t.Errorf("expected type AdaptiveCard, got %s", card.Type)
	}
	if card.Version != "1.2" {
		t.Errorf("expected version 1.2, got %s", card.Version)
	}
	if len(card.Body) != 3 {
		t.Fatalf("expected 3 body elements, got %d", len(card.Body))
	}

	// Element 0: Header TextBlock
	if card.Body[0].Type != "TextBlock" || card.Body[0].Text != "vtrFlux Machine ID: 25-115G" {
		t.Errorf("unexpected header item: %+v", card.Body[0])
	}
	if card.Body[0].Weight != "Bolder" || card.Body[0].Size != "Medium" {
		t.Errorf("unexpected header styling: %+v", card.Body[0])
	}

	// Element 1: Description TextBlock
	if card.Body[1].Type != "TextBlock" || card.Body[1].Text != "Defect brief description goes here." || !card.Body[1].Wrap {
		t.Errorf("unexpected description item: %+v", card.Body[1])
	}

	// Element 2: FactSet
	if card.Body[2].Type != "FactSet" || len(card.Body[2].Facts) != 4 {
		t.Fatalf("unexpected factset item: %+v", card.Body[2])
	}

	facts := card.Body[2].Facts
	if facts[0].Title != "Machine ID:" || facts[0].Value != "25-115G" {
		t.Errorf("unexpected Machine ID fact: %+v", facts[0])
	}
	if facts[1].Title != "Opened By:" || facts[1].Value != "Lucas Rettore" {
		t.Errorf("unexpected Opened By fact: %+v", facts[1])
	}
	if facts[2].Title != "Date Opened:" || facts[2].Value != "2026-09-16 14:28 EDT" {
		t.Errorf("unexpected Date Opened fact: got %s, expected 2026-09-16 14:28 EDT", facts[2].Value)
	}
	if facts[3].Title != "Due Date:" || facts[3].Value != "2026-09-18 17:00 EDT" {
		t.Errorf("unexpected Due Date fact: got %s, expected 2026-09-18 17:00 EDT", facts[3].Value)
	}
}

func TestPowerAutomateChannel_DefaultRecipientEmail(t *testing.T) {
	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      "http://example.com/webhook",
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
	}
	channel := NewPowerAutomateChannel(cfg, nil)

	notif := IssueNotification{
		DefectID:       uuid.New(),
		MachineNumber:  "26-100",
		Description:    "Test issue without recipient email",
		RecipientEmail: "", // Empty
		DateOpened:     time.Now(),
		Timezone:       "America/Toronto",
	}

	card := channel.BuildAdaptiveCard(notif)
	if card.RecipientEmail != "justin@vtrfeedersolutions.com" {
		t.Errorf("expected fallback recipient justin@vtrfeedersolutions.com, got %s", card.RecipientEmail)
	}
	if card.Body[2].Facts[3].Value != "None" {
		t.Errorf("expected due date fact 'None', got %s", card.Body[2].Facts[3].Value)
	}
}

func TestPowerAutomateChannel_SendIssueNotification_Success(t *testing.T) {
	var receivedBody AdaptiveCardPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}

		if err := json.NewDecoder(r.Body).Decode(&receivedBody); err != nil {
			t.Errorf("failed to decode request body: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      server.URL,
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
	}
	channel := NewPowerAutomateChannel(cfg, server.Client())

	notif := IssueNotification{
		DefectID:       uuid.New(),
		MachineNumber:  "25-115G",
		Description:    "Defect brief description goes here.",
		RecipientEmail: "lucas@vtrfeedersolutions.com",
		OpenedByName:   "User goes here.",
		DateOpened:     time.Now(),
		Timezone:       "America/Toronto",
	}

	err := channel.SendIssueNotification(context.Background(), notif)
	if err != nil {
		t.Fatalf("unexpected error sending notification: %v", err)
	}

	if receivedBody.RecipientEmail != "lucas@vtrfeedersolutions.com" {
		t.Errorf("server received recipient %s, expected lucas@vtrfeedersolutions.com", receivedBody.RecipientEmail)
	}
	if receivedBody.Body[0].Text != "vtrFlux Machine ID: 25-115G" {
		t.Errorf("server received header %s", receivedBody.Body[0].Text)
	}
}

func TestPowerAutomateChannel_SendIssueNotification_Error(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "internal flow failure"}`))
	}))
	defer server.Close()

	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      server.URL,
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
	}
	channel := NewPowerAutomateChannel(cfg, server.Client())

	notif := IssueNotification{
		DefectID:       uuid.New(),
		MachineNumber:  "25-115G",
		Description:    "Defect test error",
		RecipientEmail: "lucas@vtrfeedersolutions.com",
		DateOpened:     time.Now(),
		Timezone:       "America/Toronto",
	}

	err := channel.SendIssueNotification(context.Background(), notif)
	if err == nil {
		t.Fatal("expected error on 500 response, got nil")
	}
}

func TestDispatcher_Dispatch(t *testing.T) {
	received := make(chan IssueNotification, 1)
	mockChan := &mockChannel{
		name:    "mock",
		enabled: true,
		sendFunc: func(ctx context.Context, notif IssueNotification) error {
			received <- notif
			return nil
		},
	}

	d := NewDispatcher(10, 1)
	d.RegisterChannel(mockChan)

	notif := IssueNotification{
		DefectID:      uuid.New(),
		MachineNumber: "TEST-01",
		Description:   "Dispatcher test",
		DateOpened:    time.Now(),
		Timezone:      "America/Toronto",
	}

	d.Dispatch(notif)

	select {
	case item := <-received:
		if item.MachineNumber != "TEST-01" {
			t.Errorf("expected MachineNumber TEST-01, got %s", item.MachineNumber)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for dispatched notification")
	}

	d.Stop()
}

type mockChannel struct {
	name     string
	enabled  bool
	sendFunc func(ctx context.Context, notif IssueNotification) error
}

func (m *mockChannel) Name() string { return m.name }
func (m *mockChannel) IsEnabled() bool { return m.enabled }
func (m *mockChannel) SendIssueNotification(ctx context.Context, notif IssueNotification) error {
	if m.sendFunc != nil {
		return m.sendFunc(ctx, notif)
	}
	return nil
}
