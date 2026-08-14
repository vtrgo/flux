# Postgres & Database Guidelines

## Postgres File Permissions (`sudo -u postgres`)

When writing scripts that execute PostgreSQL commands as the `postgres` user (e.g., `sudo -u postgres psql`), **never** attempt to have `psql` read files directly from the user's home directory via the `-f` flag. The `postgres` user is prevented by standard Linux security from traversing a regular user's home directory, which will result in `Permission denied` and `No such file or directory` errors.

**Best Practices to Resolve This:**

1. **Pipe Files via STDIN:** 
   Use `cat` (which runs as the standard user or root) and pipe the file contents into `psql` running as `postgres`. Because `postgres` is only reading standard input, it does not need file traversal permissions.
   ```bash
   # DO NOT do this:
   # sudo -u postgres psql -d "dbname" -f "migration.sql"

   # DO THIS:
   cat "migration.sql" | sudo -u postgres psql -d "dbname"
   ```

2. **Avoid Directory Warnings:** 
   When running inline commands, `psql` will try to start in the current working directory. If that directory is within `/home/`, it will throw a `could not change directory` warning. Wrap the execution in a subshell and `cd /tmp` first to provide a safe working directory for the `postgres` user.
   ```bash
   (cd /tmp && sudo -u postgres psql -d "dbname" -c "SELECT 1;")
   ```

# Git & Version Control Guidelines

## Guaranteed Branch Management
To ensure a professionally tracked and version-controlled workflow, all agents must adhere to the following Git practices:

1. **Never Commit Directly to `main` for Features:**
   When starting a new feature, integration, or significant refactor, always check out a new branch.
   ```bash
   git checkout -b feature/name-of-feature
   ```
2. **Atomic & Descriptive Commits:**
   Commit often with clear, descriptive messages that explain the *why* alongside the *what*. Group related changes logically.
   ```bash
   git add .
   git commit -m "feat(sales): add sales_orders schema and API handlers"
   ```
3. **Status Checks:**
   Regularly use `git status` and `git diff` to ensure you are not committing unintended files (like temporary scripts or `.env` files). Use `.gitignore` appropriately.
4. **Agent Handoff:**
   Before stopping work or handing off to another agent/user, ensure the current working tree is clean (committed or stashed).
5. **Continuous Deployment & Pushing:**
   Never push to the remote repository (e.g., `git push`) or merge feature branches into `main` unless the user has explicitly commanded you to do so. This is a strict, user-driven decision.

# Testing & Verification Guidelines

## Mandatory Testing
To guarantee operational status after every iteration, all agents must follow these testing rules:

1. **Iterative Script Validation**:
   - At the final step of all major feature implementations or refactors, agents **MUST** execute `./scripts/test.sh`.
   - Never consider a feature "done" until this test script executes successfully and outputs `[Success] All tests and verifications passed`.
2. **Backend Testing (Go):**
   - Every new REST API endpoint must have an integration test using `httptest` (e.g., `handlers_sales_test.go`, `handlers_machines_test.go`).
   - Validate both successful requests (200/201 HTTP status) and expected failures (400/404 HTTP status).
3. **Test-Driven Operations:**
   - Update existing tests first if expected behavior changes.
   - Always prompt the user for feedback after the final test run confirms the build is green.

# Backend Architecture Guidelines

## API Response Standardization
To guarantee accurate `Content-Type` headers and to prevent internal data leakage, **all HTTP handlers must use the unified response utilities** found in `internal/api/response.go`.

1. **Successful Responses (`respondJSON`):**
   Never use `json.NewEncoder(w).Encode(data)` directly. Always use:
   ```go
   respondJSON(w, http.StatusOK, data)
   ```
   This ensures the `Content-Type: application/json` header is reliably applied.

2. **Error Responses (`respondError`):**
   Never use `http.Error(w, err.Error(), 500)`. Always use:
   ```go
   respondError(w, http.StatusInternalServerError, "User-facing error message", err)
   ```
   This guarantees that the raw `err` is securely logged to the backend's stdout, but the frontend only receives a sanitized JSON payload like `{"error": "User-facing error message"}`.

# Frontend Architecture Guidelines

## Component Modularity & Custom Hooks
1. **Separation of Concerns:** Do not build "God components" (like a single `page.tsx` handling fetching, SSE patching, and complex UI rendering). Extract data-fetching and SSE orchestration logic into custom React hooks (e.g., `src/hooks/useDashboardData.ts`).
2. **Reusable UI:** Identify duplicated UI structures (like identical cards or columns) and abstract them into reusable components inside `src/components/`, utilizing CSS modules to encapsulate their styling.

## Data Aggregation & Client Filtering
1. **Server-Side Filtering:** Avoid fetching large collections of data (e.g. `GET /api/defects`) only to filter them on the client via `array.filter()`. Always append query parameters to the URL using the `fetchApi` utility (`{ params: { key: value } }`) and perform the `WHERE` filter at the database layer in the Go backend.
2. **Backend Aggregation:** Do not use `array.reduce()` or similar mapping loops in React components to calculate sums, totals, or aggregated metrics (e.g., project-level summaries). All data aggregation must be performed at the database layer using SQL `GROUP BY` and `JOIN` clauses, exposed via dedicated Go API endpoints.

## Server-Sent Events (SSE)
All frontend real-time updates must be managed through the centralized `SSEProvider` service to avoid multiple concurrent connections and to gracefully handle network reconnections and orphaned states.

1. **Global Provider:** The application root (`layout.tsx`) must be wrapped with `<SSEProvider>`.
2. **Hook-Based Subscription:** Individual components must subscribe to specific events using the `useSSE` hook. Never instantiate a raw `EventSource` in a page or component.
   ```tsx
   import { useSSE } from '../components/SSEProvider';

   export default function MyComponent() {
     useSSE('machine_updated', (updatedMachine) => {
       // update local state
     });
   }
   ```
3. **Connection Status:** Use `useSSEConnectionStatus()` to determine if the realtime pipe is active and display a warning or fallback UI if disconnected.
4. **Re-fetching vs Patching:** For high-throughput events, patch the local state dynamically using the hook's payload. For destructive cascading events (like `sales_order_deleted`), perform a full refetch of the affected resources to ensure no orphaned state persists.

## API Client & Data Fetching
All data fetching must be routed through the centralized `fetchApi` wrapper located at `frontend/src/lib/api.ts`.
1. **No Raw Fetches:** Never use raw `fetch('http://localhost:8080/api/...')` in components.
2. **Robust JSON Parsing:** The backend may occasionally omit `Content-Type: application/json` on successful responses. `fetchApi` explicitly attempts to parse all successful responses via `JSON.parse()` before falling back to text, preventing string-map runtime crashes.
3. **Environment Parity:** `fetchApi` automatically references `NEXT_PUBLIC_API_URL` to ensure safe promotion across environments without code changes.

## Separation of Concerns (Interfaces)
To maintain a scalable Next.js codebase, do not inline duplicate TypeScript interfaces (e.g. `Machine`, `SalesOrder`, `Defect`) at the top of page components.
1. **Central Types Directory:** All shared entity types must be defined and exported from `frontend/src/types/index.ts`.
2. **Component Imports:** Import these shared types wherever needed to ensure single-source-of-truth accuracy as the database schema evolves.

# Build & Deployment Guidelines

## Single Executable Strategy (Go:Embed)
To simplify deployment, this project strictly uses a single-executable paradigm powered by Go's `//go:embed` directive. The Next.js frontend is baked directly into the Go backend binary.

When making deployment-related modifications or writing build scripts, agents must enforce the following sequence:

1. **Static Frontend Export**: 
   - The Next.js frontend must be built as a purely static HTML/CSS/JS export.
   - Run `npm run build` with Next.js configured for `output: 'export'`. This populates the `frontend/out` directory.
   - **CRITICAL:** `next.config.ts` MUST contain `trailingSlash: true` so that route files are exported as directories with an `index.html` (e.g., `assembly/index.html`). This ensures compatibility when served natively by Go's `http.FileServer`.
2. **Embedded Go Binary**:
   - The Go backend utilizes `//go:embed all:frontend/out` to package the static assets.
   - The Go HTTP router serves the `/api/*` endpoints for business logic, and falls back to serving the embedded file system for all other routes.
3. **Build Execution**:
   - A complete build is accomplished by sequentially running the frontend build, followed by `go build` in the backend. 
   - Never attempt to deploy Node.js / Next.js server runtimes to production. The Go binary is the solitary production artifact.
