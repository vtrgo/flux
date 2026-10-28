package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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
	if card.Body[2].Type != "FactSet" {
		t.Fatalf("unexpected factset item: %+v", card.Body[2])
	}

	factsMap := make(map[string]string)
	for _, f := range card.Body[2].Facts {
		factsMap[f.Title] = f.Value
	}

	if factsMap["Machine ID:"] != "25-115G" {
		t.Errorf("unexpected Machine ID fact: %s", factsMap["Machine ID:"])
	}
	if factsMap["Opened By:"] != "Lucas Rettore" {
		t.Errorf("unexpected Opened By fact: %s", factsMap["Opened By:"])
	}
	if factsMap["Date Opened:"] != "2026-09-16 14:28 EDT" {
		t.Errorf("unexpected Date Opened fact: got %s, expected 2026-09-16 14:28 EDT", factsMap["Date Opened:"])
	}
	if factsMap["Due Date:"] != "2026-09-18 17:00 EDT" {
		t.Errorf("unexpected Due Date fact: got %s, expected 2026-09-18 17:00 EDT", factsMap["Due Date:"])
	}
	if factsMap["Department:"] != "Controls" {
		t.Errorf("unexpected Department fact: got %s, expected Controls", factsMap["Department:"])
	}
	if factsMap["Severity:"] != "CRITICAL" {
		t.Errorf("unexpected Severity fact: got %s, expected CRITICAL", factsMap["Severity:"])
	}
	if !strings.Contains(factsMap["Issue Link:"], "http://vtrflux/machine?id=") {
		t.Errorf("unexpected Issue Link fact: %s", factsMap["Issue Link:"])
	}

	// Verify actions and HTML link
	if len(card.Actions) != 1 || card.Actions[0].Type != "Action.OpenUrl" || card.Actions[0].Title != "View Issue in vtrFlux" {
		t.Errorf("unexpected Actions: %+v", card.Actions)
	}
	if !strings.Contains(card.IssueLinkHTML, `<a href="http://vtrflux/machine?id=`) {
		t.Errorf("unexpected IssueLinkHTML: %s", card.IssueLinkHTML)
	}
}

func TestPowerAutomateChannel_BuildAdaptiveCard_WithDetailedNotesAndAssignee(t *testing.T) {
	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      "http://example.com/webhook",
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
		AppBaseURL:            "http://vtrflux",
	}
	channel := NewPowerAutomateChannel(cfg, nil)

	dueDate := time.Date(2026, 9, 25, 21, 0, 0, 0, time.UTC)
	dateOpened := time.Date(2026, 9, 20, 15, 30, 0, 0, time.UTC)
	defectID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	machineID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	notif := IssueNotification{
		DefectID:       defectID,
		MachineID:      machineID,
		MachineNumber:  "25-200A",
		Description:    "Bowl feeder sensor bracket loose",
		Severity:       "major",
		Status:         "open",
		AssignedDept:   "assembly",
		AssigneeName:   "Lucas Rettore",
		Notes:          "Tighten M5 bracket bolts and re-calibrate fiber optic sensor before noon FAT.",
		RecipientEmail: "lucas@vtrfeedersolutions.com",
		OpenedByName:   "Justin Reporter",
		DateOpened:     dateOpened,
		DueDate:        &dueDate,
		Timezone:       "America/Toronto",
	}

	card := channel.BuildAdaptiveCard(notif)

	// Since Notes are present, len(card.Body) should be 4: Header, Description, Detailed Notes, FactSet
	if len(card.Body) != 4 {
		t.Fatalf("expected 4 body elements with notes, got %d", len(card.Body))
	}

	// Element 0: Header
	if card.Body[0].Text != "vtrFlux Machine ID: 25-200A" {
		t.Errorf("unexpected header: %s", card.Body[0].Text)
	}

	// Element 1: Description
	if card.Body[1].Text != "Bowl feeder sensor bracket loose" {
		t.Errorf("unexpected description: %s", card.Body[1].Text)
	}

	// Element 2: Detailed Notes
	expectedNotes := "**Detailed Notes:**\nTighten M5 bracket bolts and re-calibrate fiber optic sensor before noon FAT."
	if card.Body[2].Type != "TextBlock" || card.Body[2].Text != expectedNotes || !card.Body[2].Wrap {
		t.Errorf("unexpected detailed notes item: %+v", card.Body[2])
	}

	// Element 3: FactSet
	if card.Body[3].Type != "FactSet" {
		t.Fatalf("expected FactSet at Body[3], got: %+v", card.Body[3])
	}

	factsMap := make(map[string]string)
	for _, f := range card.Body[3].Facts {
		factsMap[f.Title] = f.Value
	}

	if factsMap["Assignee:"] != "Lucas Rettore" {
		t.Errorf("expected Assignee 'Lucas Rettore', got %s", factsMap["Assignee:"])
	}
	if factsMap["Department:"] != "Assembly" {
		t.Errorf("expected Department 'Assembly', got %s", factsMap["Department:"])
	}
	if factsMap["Severity:"] != "MAJOR" {
		t.Errorf("expected Severity 'MAJOR', got %s", factsMap["Severity:"])
	}
	if factsMap["Status:"] != "OPEN" {
		t.Errorf("expected Status 'OPEN', got %s", factsMap["Status:"])
	}

	expectedURL := "http://vtrflux/machine?id=22222222-2222-2222-2222-222222222222&defect_id=11111111-1111-1111-1111-111111111111"
	if card.IssueURL != expectedURL {
		t.Errorf("expected IssueURL %s, got %s", expectedURL, card.IssueURL)
	}
	expectedHTML := `<a href="http://vtrflux/machine?id=22222222-2222-2222-2222-222222222222&defect_id=11111111-1111-1111-1111-111111111111">View Issue on 25-200A in vtrFlux</a>`
	if card.IssueLinkHTML != expectedHTML {
		t.Errorf("expected IssueLinkHTML %s, got %s", expectedHTML, card.IssueLinkHTML)
	}

	if len(card.Actions) != 1 || card.Actions[0].URL != expectedURL {
		t.Errorf("expected action URL %s, got %+v", expectedURL, card.Actions)
	}
}

func TestPowerAutomateChannel_BuildAdaptiveCard_NCR(t *testing.T) {
	cfg := Config{
		Enabled:               true,
		PowerAutomateURL:      "http://example.com/webhook",
		DefaultRecipientEmail: "justin@vtrfeedersolutions.com",
	}
	channel := NewPowerAutomateChannel(cfg, nil)

	dateOpened := time.Date(2026, 9, 22, 14, 0, 0, 0, time.UTC)

	notif := IssueNotification{
		DefectID:          uuid.New(),
		MachineID:         uuid.New(),
		MachineNumber:     "VTR-2001",
		Description:       "Linear track guide misaligned by 2.5mm",
		Severity:          "moderate",
		AssignedDept:      "assembly",
		RecipientEmail:    "enda@vtrfeedersolutions.com",
		OpenedByName:      "Quality Inspector Jane",
		DateOpened:        dateOpened,
		Timezone:          "America/Toronto",
		IsNCR:             true,
		NCRNumber:         "NCR-2026-088",
		Assembler:         "Sam Technician",
		Location:          "Station 2 Feed Rail",
		RootCause:         "Guide fixture clamp loosened during vibration cycle",
		CorrectiveAction:  "Re-torqued clamp bolts and re-aligned rail",
		TeamLeadSignature: "Enda McNamara",
		Status:            "open",
	}

	card := channel.BuildAdaptiveCard(notif)

	if card.RecipientEmail != "enda@vtrfeedersolutions.com" {
		t.Errorf("expected recipient enda@vtrfeedersolutions.com, got %s", card.RecipientEmail)
	}

	// Verify header explicitly indicates NCR and NCR Number
	if card.Body[0].Text != "⚠️ NON-CONFORMANCE REPORT: NCR-2026-088 (Machine: VTR-2001)" {
		t.Errorf("unexpected header text: %s", card.Body[0].Text)
	}

	// Verify description contains NCR context
	if card.Body[1].Text != "**NCR Non-Conformance Details:**\nLinear track guide misaligned by 2.5mm" {
		t.Errorf("unexpected description text: %s", card.Body[1].Text)
	}

	// Verify Facts contain NCR details
	facts := card.Body[2].Facts
	foundType := false
	foundNCRNum := false
	foundLocation := false
	foundAssembler := false
	foundResponsible := false
	foundRootCause := false
	foundCorrection := false

	for _, f := range facts {
		if f.Title == "Notification Type:" && f.Value == "Non-Conformance Report (NCR)" {
			foundType = true
		}
		if f.Title == "NCR Identification #:" && f.Value == "NCR-2026-088" {
			foundNCRNum = true
		}
		if f.Title == "Location of NC:" && f.Value == "Station 2 Feed Rail" {
			foundLocation = true
		}
		if f.Title == "Assembler:" && f.Value == "Sam Technician" {
			foundAssembler = true
		}
		if f.Title == "Assigned Responsible:" && f.Value == "Enda McNamara" {
			foundResponsible = true
		}
		if f.Title == "Root Cause:" && f.Value == "Guide fixture clamp loosened during vibration cycle" {
			foundRootCause = true
		}
		if f.Title == "Corrective Action:" && f.Value == "Re-torqued clamp bolts and re-aligned rail" {
			foundCorrection = true
		}
	}

	if !foundType {
		t.Error("missing or incorrect Notification Type fact")
	}
	if !foundNCRNum {
		t.Error("missing or incorrect NCR Identification # fact")
	}
	if !foundLocation {
		t.Error("missing or incorrect Location of NC fact")
	}
	if !foundAssembler {
		t.Error("missing or incorrect Assembler fact")
	}
	if !foundResponsible {
		t.Error("missing or incorrect Assigned Responsible fact")
	}
	if !foundRootCause {
		t.Error("missing or incorrect Root Cause fact")
	}
	if !foundCorrection {
		t.Error("missing or incorrect Corrective Action fact")
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

func TestPowerAutomateChannel_SendIssueNotification_RetrySuccess(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			// First attempt fails with transient 503
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error": "temporarily unavailable"}`))
			return
		}
		// Second attempt succeeds
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
		Description:    "Defect test retry",
		RecipientEmail: "lucas@vtrfeedersolutions.com",
		DateOpened:     time.Now(),
		Timezone:       "America/Toronto",
	}

	err := channel.SendIssueNotification(context.Background(), notif)
	if err != nil {
		t.Fatalf("expected retry to succeed, got: %v", err)
	}

	if attempts != 2 {
		t.Errorf("expected 2 attempts, got %d", attempts)
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
