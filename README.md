# vtrFlux - Manufacturing Execution System (MES)

vtrFlux is a comprehensive Manufacturing Execution System (MES) designed to track the lifecycle of custom machinery builds from inception to final quality sign-off. It provides a single source of truth across all manufacturing departments, acting as a "Digital Birth Certificate" for every machine.

## System Architecture

vtrFlux is built on a modern, decoupled client-server architecture:

- **Backend API (Go):** A high-performance, strictly typed REST API.
  - Built with Go (1.24).
  - Uses `net/http` for routing and JSON serialization.
  - Employs Server-Sent Events (SSE) for real-time state synchronization across factory terminals.
  - Direct PostgreSQL integration via `github.com/lib/pq` for performant data access.

- **Frontend Client (Next.js):** A responsive, terminal-friendly UI designed for factory floor operations.
  - Next.js 16.3 with React 19.
  - TypeScript strictly enforced.
  - Modular CSS with a unified dark-mode design system.

- **Data Persistence (PostgreSQL):** A heavily relational database schema enforcing referential integrity across the build lifecycle.

## Core Modules & Data Models

1. **Machines (`machines`):** The core entity representing a physical machine order (e.g., VibroBowl 500, Linear Feeder X1).
2. **Design (`design_documents`, `design_feedback`):** Tracks CAD models, electrical schematics, BOMs, and engineering change requests (ECOs).
3. **Machine Shop (`machine_shop_tasks`):** Manages custom machining tasks and part fabrication.
4. **Kitting (`kitting_parts`):** Bill of Materials (BOM) management, tracking part picking and fulfillment for assembly.
5. **Assembly (`assembly_tasks`):** Mechanical build steps, sign-offs, and tracking.
6. **Electrical/Controls (`controls_checkpoints`):** Wiring checklists, PLC firmware tracking, and I/O validation.
7. **Quality (`quality_inspections`, `defects`):** Pre-FAT and FAT runoff inspections, with cross-departmental defect routing.

## Setup & Deployment

### Database Initialization
Run the bootstrap script to initialize the PostgreSQL schema (requires `sudo` for role management):
```bash
sudo ./scripts/bootstrap_flux_db.sh
```

### Backend (Go)
```bash
go run ./cmd/flux/main.go
```
*Listens on port 8080 by default.*

### Frontend (Next.js)
```bash
cd frontend
npm run dev
```
*Available at http://localhost:3000.*
