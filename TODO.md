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
