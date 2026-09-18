# Flux Notification Subsystem & Power Automate Integration

This document outlines the architecture, payload specification, configuration, and frontend integration of the notification system in **Flux MES**.

---

## 1. Overview

Flux includes a real-time notification engine designed to alert shop-floor personnel and departmental leads when quality defects and machine issues are logged. 

The notification system consists of two primary delivery pathways:
1. **Microsoft Power Automate (Adaptive Cards):** External webhook dispatch that posts formatted Microsoft Adaptive Cards (v1.2) to Microsoft Teams channels, Outlook inboxes, or mobile Power Automate workflows.
2. **In-App Real-Time Notification Center:** Live bell icon and notification tray in the Flux global header, driven by Server-Sent Events (SSE) with persistent client-side history.

---

## 2. Architecture & Delivery Pipeline

```
[ Frontend: IssueModal ]
         │
         │ POST /api/machines/{id}/defects
         │ { send_notification: true, ... }
         ▼
[ Go Backend: handlers_quality.go ]
         │
         ├──────────────────────────────────┐
         ▼                                  ▼
[ SSE Broadcaster ]               [ Notification Dispatcher ]
(event: defect_added)             (internal/notifications/dispatcher.go)
         │                                  │
         ▼                                  ▼
[ Active Browsers ]                 Worker Pool Queue
(NotificationBell.tsx)                      │
                                            ▼
                               [ Power Automate Channel ]
                               (internal/notifications/powerautomate.go)
                                            │
                                            ▼ HTTP POST (Adaptive Card v1.2)
                               [ Power Automate Workflow Endpoint ]
                                            │
                                            ▼
                               [ Microsoft Teams / Outlook ]
```

### Key Components

* **`internal/notifications/channel.go`**: Defines the `Channel` interface (`Name()`, `IsEnabled()`, `SendIssueNotification()`) and normalized `IssueNotification` payload.
* **`internal/notifications/dispatcher.go`**: Manages a bounded buffered channel and worker goroutines to decouple API request execution from external webhook network latency. Includes fallback goroutines if the queue is saturated, along with clean shutdown hooks.
* **`internal/notifications/powerautomate.go`**: Implements the `Channel` interface for Microsoft Power Automate, translating internal defect data into compliant Adaptive Card v1.2 JSON payloads.
* **`internal/notifications/config.go`**: Loads notification runtime settings from environment variables with sensible defaults.
* **`frontend/src/components/NotificationBell.tsx`**: Header component featuring unread badges, timestamp formatting, filter controls, mark-as-read, and quick issue inspection.
* **`frontend/src/hooks/useInAppAlerts.ts`**: Custom hook managing SSE subscriptions for `defect_added` events and `localStorage` persistence.

---

## 3. Configuration & Environment Variables

The notification subsystem is configured using environment variables (defined in `.env` / `.env.example`):

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NOTIFICATIONS_ENABLED` | boolean | `true` | Globally enables or disables outbound webhook notifications across all channels. |
| `POWER_AUTOMATE_WEBHOOK_URL` | string | *Configured production workflow URL* | Target HTTPS endpoint for the Power Automate manual trigger. |
| `DEFAULT_NOTIFICATION_RECIPIENT_EMAIL` | string | `justin@vtrfeedersolutions.com` | Fallback recipient email used when an issue is logged without an assigned user email. |

### Timezone Resolution
Adaptive Cards format reported timestamps using the facility's local timezone. The system queries the `system_settings` database table for the `timezone` key (e.g., `America/Toronto`, `America/New_York`). If unavailable or unconfigured, it defaults gracefully to `America/Toronto`.

---

## 4. Adaptive Card Payload Format

When an issue is dispatched, an Adaptive Card (v1.2) payload is constructed and transmitted via HTTP POST.

A complete sample payload is available in [issue_notification_payload.json](file:///home/justin/code/vtr/flux/docs/notifications/issue_notification_payload.json).

### Core Fields

* **`recipient_email`**: Target email address for the notification (resolved from the assigned technician or the default fallback).
* **`body[0]` (Header TextBlock)**: Prominent title styled with severity color accents (e.g., `Attention` for critical issues).
* **`body[2]` (FactSet)**: Key-value metadata including:
  * Issue ID (`DEF-...`)
  * Severity (`CRITICAL`, `MAJOR`, `MINOR`)
  * Status (`Open`)
  * Target Resolution (Due Date)
  * Machine Order Number & Model
  * Source Department & Assigned Department
  * Assigned Technician & Reporter
  * Local Date/Time Reported
* **`body[3..4]` (Containers)**: Formatted description and detailed notes/context blocks.
* **`actions` (Action.OpenUrl)**: Deep-links directly to the machine detail view and the Quality Inspection Hub in Flux.
* **`metadata`**: Machine-readable JSON metadata block for automated parsing in downstream Power Automate flows.

---

## 5. Shop Floor & Frontend Workflows

### Issue Logging & Notification Routing
When submitting an issue via `IssueModal`:
* Technicians can toggle the **"Send notification to assignee & department"** checkbox (`NotificationRoutingCheckbox.tsx`).
* Hotkey **`C`** (or **`+ ADD ISSUE`** on the Active Pipeline dashboard) immediately opens the issue submission modal with notification routing enabled by default.

### In-App Notification Center (`NotificationBell`)
* Displays an unread badge with the count of incoming defects in real time.
* Audio/visual cues upon receiving real-time SSE broadcasts.
* Dropdown drawer with:
  * Time-ago relative timestamps (using shop timezone).
  * Direct clickable navigation to relevant machines or department queues.
  * Single-click **Mark all as read** and **Clear history** controls.
  * Local state persisted across browser refreshes via `localStorage`.

---

## 6. Testing & Validation

Backend notification unit tests are located in `internal/notifications/powerautomate_test.go`:
```bash
# Run notification-specific backend unit tests
go test -v ./internal/notifications/...
```

Frontend notification UI and hook tests:
```bash
# Run notification unit tests in Vitest
cd frontend && npx vitest run src/components/NotificationBell.test.tsx src/components/NotificationRoutingCheckbox.test.tsx src/hooks/useInAppAlerts.test.ts
```
