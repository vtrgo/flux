# Future Frontend Optimizations

## React Memoization & Render Optimization
As noted during the frontend refactor, the current codebase has some unoptimized React rendering patterns that defeat the `React.memo` wrapping on heavily duplicated components (like `MachineCard.tsx` and `IssueCard.tsx`).

### Dashboard View (`src/app/page.tsx`)
- [ ] **Memoize the Delete Handler:** Wrap `handleDeleteMachine` inside `useCallback` with an empty dependency array.
- [ ] **Memoize the Selection Handler:** Extract the inline `onSelectDept` arrow function into a new `handleSelectDept` function wrapped in `useCallback`.
- [ ] **Pass References:** Update the `<MachineCard>` JSX to pass these stable references, ensuring `React.memo` properly skips re-renders.

### Kanban View (`src/components/DepartmentHub.tsx`)
- [ ] **Memoize the Component:** Update `src/components/IssueCard.tsx` to wrap the exported function in `React.memo()`.
- [ ] **Memoize the Handlers:** In `src/components/DepartmentHub.tsx`, wrap `openEditModal`, `handleStatusChange`, and `handleDelete` in `useCallback`.
- [ ] **Refactor Inline Actions:** Refactor the `<IssueCard />` props so that the action buttons don't rely on inline arrow functions created on every render.

# Future Backend Architecture Improvements

## Database Configuration & ORMs
- [ ] **Dependency Injection:** Refactor handlers to eliminate the global `db.DB` usage. Create a central `Server` or `App` struct that holds the `*sql.DB` connection and binds handlers as methods on the struct (e.g., `func (s *Server) handleGetAllDefects(...)`). This enables isolated unit testing with mock databases.
- [ ] **Adopt `sqlc`:** Replace raw `database/sql` queries and manual `rows.Scan` boilerplate with `sqlc` to automatically generate type-safe Go structs from `.sql` queries, reducing human error during schema migrations.

## Middleware Infrastructure
- [ ] **Middleware Chains:** Implement a scalable middleware orchestration chain (e.g., `chain(Logging, Auth, Cors, handleAddLaserTask)`) to support future requirements like JWT authentication, request logging, and granular user authorization scopes.

# Future Deployment & Infrastructure
- [ ] **One-Line Installer (`install.sh`):** Create a bulletproof installation shell script that users can run via a single `curl` command. This script should automatically install PostgreSQL if missing, configure the `flux` database, download the latest GitHub Release binary, and register it as a persistent `systemd` service.
- [ ] **Auto-Update Mechanism:** Investigate adding an auto-update routine (e.g., polling a private release server and safely restarting the binary) so the shop floor screens never require manual intervention.
