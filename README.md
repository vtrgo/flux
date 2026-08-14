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

## Quick Start & Development

We provide automated scripts to make spinning up the environment simple.

### 1. Database Initialization
Ensure PostgreSQL is running, then use the bootstrap script to automatically create the database, apply all schema migrations, and optionally seed it with sample data:
```bash
./scripts/bootstrap_flux_db.sh
```

### 2. Testing
Before running or building, ensure the environment is healthy by executing the unified test suite (which validates Go handlers and type-checks the Next.js frontend):
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

*   `/cmd/flux`: The application entry point.
*   `/internal/api`: Go HTTP handlers, SSE broadcasting, and unified JSON responses.
*   `/internal/models`: Data structures reflecting the PostgreSQL schema.
*   `/frontend/src/app`: Next.js pages and routing.
*   `/frontend/src/components`: Reusable UI modules (e.g., `IssueCard`, `DepartmentHub`).
*   `/frontend/src/hooks`: Decoupled data-fetching and SSE state orchestration.
