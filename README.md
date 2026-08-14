# Flux - VTR Feeder Solutions MES

Flux is a custom, real-time Manufacturing Execution System (MES) and issue-tracking platform built for VTR Feeder Solutions. It digitizes the shop floor by replacing manual paper workflows and disconnected spreadsheets with a unified, live data hub.

## Architecture

Flux is built on a high-performance, single-executable paradigm. The modern frontend is statically exported and baked directly into the Go backend binary, resulting in an incredibly simple deployment model.

*   **Backend:** Go (Standard Library Routing `http.ServeMux`)
*   **Database:** PostgreSQL (Raw `database/sql`)
*   **Frontend:** React / Next.js (Static Export)
*   **Real-time Engine:** Native Server-Sent Events (SSE)
*   **Packaging:** `//go:embed` for a single, self-contained binary artifact

## Key Features

*   **Real-Time Department Hubs:** Live Kanban-style boards for Design, Kitting, Machine Shop, Laser, Assembly, Electrical Controls, and Enclosures.
*   **Server-Side Filtering:** Highly optimized data pipelines that filter defects and tasks at the database level before reaching the client.
*   **Live Telemetry (SSE):** Seamless state patching across all active clients. When a task status changes on the floor, the dashboard updates instantly without page reloads.
*   **Component Modularity:** A strictly typed React architecture utilizing decoupled state hooks and reusable UI components.

## Development Setup

### 1. Database Initialization
Ensure PostgreSQL is running, then initialize the database and apply the schemas:
```bash
# Create the database
createdb flux

# Apply schemas in sequence
cat scripts/migrations/000001_init_mes_schema.up.sql | psql flux
cat scripts/migrations/000002_add_enclosures.up.sql | psql flux
cat scripts/migrations/000003_add_sales_orders.up.sql | psql flux
cat scripts/migrations/000004_add_laser.up.sql | psql flux
```

### 2. Running Locally (Development Mode)
You will need to run the Go backend and the Next.js frontend simultaneously to take advantage of hot-reloading.

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

### 3. Production Build
To compile the entire application into a single production binary:
```bash
# 1. Build the static frontend export
cd frontend
npm run build

# 2. Build the Go binary (which embeds the static frontend)
cd ..
go build -o bin/flux ./cmd/flux
```
You can then run `./bin/flux` on your production server.

## Codebase Organization

*   `/cmd/flux`: The application entry point.
*   `/internal/api`: Go HTTP handlers, SSE broadcasting, and unified JSON responses.
*   `/internal/models`: Data structures reflecting the PostgreSQL schema.
*   `/frontend/src/app`: Next.js pages and routing.
*   `/frontend/src/components`: Reusable UI modules (e.g., `IssueCard`, `DepartmentHub`).
*   `/frontend/src/hooks`: Decoupled data-fetching and SSE state orchestration.
