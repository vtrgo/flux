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
