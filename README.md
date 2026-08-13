# vtrFlux - Manufacturing Execution System (MES)

vtrFlux is a comprehensive Manufacturing Execution System (MES) designed to track the lifecycle of custom machinery builds from inception to final quality sign-off. It provides a single source of truth across all manufacturing departments, acting as a "Digital Birth Certificate" for every machine.

## System Architecture

vtrFlux is built on a modern, decoupled client-server architecture:

### 1. Backend API (Go)
A high-performance, strictly typed REST API designed for reliability on the factory floor.
- **Language:** Go (1.24)
- **Routing:** Built-in `net/http` for routing and JSON serialization.
- **Real-time Synchronization:** Employs Server-Sent Events (SSE) to push state updates instantly across factory terminals.
- **Database Access:** Direct PostgreSQL integration via `github.com/lib/pq` for performant, relational data access.

### 2. Frontend Client (Next.js)
A responsive, terminal-friendly UI designed for ease of use by floor operators and engineers.
- **Framework:** Next.js 16.3 with React 19
- **Language:** TypeScript strictly enforced for type safety.
- **Styling:** Modular CSS with a unified dark-mode design system.

### 3. Data Persistence (PostgreSQL)
A heavily relational database schema enforcing strict referential integrity across the entire build lifecycle.

---

## Core Modules & Data Models

Understanding the data flow is critical to implementing and extending vtrFlux. The core entities include:

1. **Machines (`machines`):** The central entity representing a physical machine order (e.g., "VibroBowl 500", "Linear Feeder X1"). All other records link back to a machine.
2. **Design (`design_documents`, `design_feedback`):** Tracks CAD models, electrical schematics, Bills of Materials (BOMs), and Engineering Change Orders (ECOs).
3. **Machine Shop (`machine_shop_tasks`):** Manages custom machining tasks, routing, and part fabrication.
4. **Kitting (`kitting_parts`):** Inventory and BOM management, tracking part picking, shortages, and fulfillment prior to assembly.
5. **Assembly (`assembly_tasks`):** Tracks mechanical build steps, operator sign-offs, and progress metrics.
6. **Electrical/Controls (`controls_checkpoints`):** Wiring checklists, PLC firmware tracking, and I/O validation procedures.
7. **Quality (`quality_inspections`, `defects`):** Pre-FAT and FAT runoff inspections, with cross-departmental defect routing and resolution tracking.

---

## Implementation & Setup Guide

Follow these instructions to configure and run the vtrFlux system locally for development or testing.

### Prerequisites
- PostgreSQL running locally
- Go (v1.24+)
- Node.js (v18+) and npm/yarn

### 1. Database Initialization
Before running the backend, the PostgreSQL schema must be initialized. The provided bootstrap script creates the necessary roles and tables.

*Note: This script requires `sudo` for role management.*
```bash
sudo ./scripts/bootstrap_flux_db.sh
```

### 2. Running the Backend API (Go)
Start the Go backend server from the project root. It will connect to the PostgreSQL database and begin listening for API requests and SSE connections.

```bash
go run ./cmd/flux/main.go
```
*The API listens on port `8080` by default. Ensure this port is available.*

### 3. Running the Frontend Client (Next.js)
Open a new terminal window, navigate to the frontend directory, install dependencies (if you haven't already), and start the Next.js development server.

```bash
cd frontend
npm install
npm run dev
```
*The application UI will be available at http://localhost:3000.*

---

## Next Steps for Development
- Ensure you have read through the schemas in the `internal/` package if you plan on modifying data models.
- When creating new UI components, refer to the unified CSS modules in the `frontend/` directory to maintain the dark-mode aesthetic.
