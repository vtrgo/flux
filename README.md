# Flux - VTR Feeder Solutions MES

Flux is a custom, real-time Manufacturing Execution System (MES) and issue-tracking platform built for VTR Feeder Solutions. It digitizes the shop floor by replacing manual paper workflows and disconnected spreadsheets with a unified, live data hub.

## Architecture

Flux is built on a high-performance, single-executable paradigm. The modern Next.js frontend is statically exported and baked directly into the Go backend binary, resulting in an incredibly simple deployment model.

*   **Backend:** Go (Standard Library Routing `http.ServeMux` with structured `slog` logging and middleware pipeline)
*   **Database:** PostgreSQL (Raw `database/sql` queries with relational integrity)
*   **Frontend:** React / Next.js (Static HTML/CSS/JS export via `output: 'export'`)
*   **Real-time Engine:** Native Server-Sent Events (SSE) broadcasting database mutations and system logs
*   **Notifications:** Asynchronous worker-pool dispatcher delivering Microsoft Adaptive Cards (v1.2) to Microsoft Power Automate
*   **Packaging:** `//go:embed` for a single, self-contained binary artifact

## Key Features

*   **Active Pipeline Dashboard:** A nested-grid executive dashboard displaying active sales orders, project machines, and aggregated deficiency totals horizontally across all operational departments.
*   **Real-Time Department Hubs:** Dedicated Kanban-style hubs for Design, Kitting, Machine Shop, Laser, Assembly, Electrical Controls, and Enclosures. 
*   **Quality Resolution Hub:** A global triage center for all quality issues, allowing cross-departmental coordination to clear defects.
*   **Automated Notifications & Power Automate Integration:** Outbound webhook dispatch sending rich Microsoft Adaptive Cards (v1.2) to Power Automate workflows, triggering instant Microsoft Teams or Outlook alerts when defects are logged or assigned.
*   **In-App Notification Center:** A real-time notification bell in the global header with unread badge counters, live SSE event reception, customizable filters, and persistent local history.
*   **Shop Floor Hotkeys & Fast Issue Intake:** Rapid issue logging via global keyboard shortcuts (`C` to open the issue modal, `/` to focus search) and a dedicated `+ ADD ISSUE` dashboard action.
*   **Unified Defect Tracking & Attachments:** All deficiencies are strictly typed and displayed via uniform `IssueCard` components with consistent severity tagging and direct photo/attachment inspection.
*   **Server-Side Aggregation & Filtering:** Highly optimized data pipelines that filter defects and aggregate project/machine totals via SQL `GROUP BY` before ever reaching the client.
*   **Live Telemetry (SSE):** Seamless state patching across all active clients. When a task status changes on the floor, the dashboard and department hubs update instantly without page reloads.
*   **Project Kickoff Pipeline:** A centralized routing interface for initializing new projects and machine configurations into the production environment.

## Configuration & Environment Variables

Flux reads configuration settings from environment variables or a local `.env` file. A complete reference is provided in [`.env.example`](.env.example).

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port on which the HTTP server listens. |
| `DATABASE_URL` | `host=/var/run/postgresql dbname=flux sslmode=disable` | PostgreSQL connection string. |
| `JWT_SECRET` | *(Random secret required)* | Secret key for JWT session authentication. |
| `NOTIFICATIONS_ENABLED` | `true` | Globally toggles outbound webhook notifications. |
| `POWER_AUTOMATE_WEBHOOK_URL` | *(Production webhook URL)* | Microsoft Power Automate HTTP trigger webhook endpoint. |
| `DEFAULT_NOTIFICATION_RECIPIENT_EMAIL` | `justin@vtrfeedersolutions.com` | Fallback recipient email for unassigned issue alerts. |
| `LDAP_ENABLED` | `false` | Enables on-premises Active Directory / LDAP authentication. |

For full notification payload specifications and architecture, see the [Notification Documentation](docs/notifications/README.md).

## Quick Start & Development

We provide automated scripts to make spinning up the environment simple.

### 1. Database Initialization
Ensure PostgreSQL is running, then use the bootstrap script to automatically create the `flux` database, apply all schema migrations, and optionally seed it with sample data:
```bash
./scripts/bootstrap_flux_db.sh
```

### 2. Testing
Before running or building, ensure the environment is healthy by executing the unified test suite (which validates Go handlers via `httptest` and runs frontend unit tests via `vitest`):
```bash
./scripts/test.sh
```

### 3. Running Locally (Development Mode)
To take advantage of hot-reloading while developing:

**Terminal 1 (Backend):**
```bash
go run ./cmd/flux
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

### 4. Production Build
To compile the entire application into a single, self-contained production binary, simply run:
```bash
./scripts/build.sh
```
This script will automatically generate the Next.js static export, embed it into the Go binary, and output the final artifact to `./bin/flux`.

## Codebase Organization

*   `/cmd/flux`: The Go application entry point, middleware chaining, and graceful shutdown orchestration.
*   `/internal/api`: Go HTTP handlers, SSE broadcaster hub, unified JSON responses, and route definitions.
*   `/internal/notifications`: Notification dispatcher worker pool, Power Automate Adaptive Card builder, and transport channels.
*   `/internal/models`: Go structs reflecting the PostgreSQL schema.
*   `/internal/db`: Database connection pool initialization and migration routines.
*   `/internal/logger`: Structured `slog` logging configuration and SSE log broadcasting.
*   `/docs/notifications`: Payload schema, Adaptive Card specifications, and integration documentation.
*   `/frontend/src/app`: Next.js page router (Dashboard, Departments, Quality, Kickoff).
*   `/frontend/src/components`: Reusable, heavily memoized UI modules (e.g., `IssueCard`, `MachineCard`, `NotificationBell`, `IssueModal`).
*   `/frontend/src/hooks`: Decoupled data-fetching, keyboard hotkeys, in-app alerts, and SSE state orchestration.
