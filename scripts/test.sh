#!/usr/bin/env bash
set -euo pipefail

echo "== [0/3] Bootstrapping Test Database =="
export DB_NAME="flux_test"
export DATABASE_URL="host=/var/run/postgresql dbname=flux_test sslmode=disable"

if ! psql -lqt | cut -d \| -f 1 | grep -qw "flux_test"; then
  echo "Error: flux_test database does not exist."
  echo "Please provision it first by running: DB_NAME=flux_test ./scripts/bootstrap_flux_db.sh"
  exit 1
fi

echo "== [1/3] Running Go Backend Tests & Linter =="
# Filter out unintended Go packages hidden inside Next.js node_modules
PACKAGES=$(go list ./... | grep -v /node_modules/)

echo "-> Running golangci-lint..."
go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run ./...

echo "-> Running Go Unit Tests..."
# -count=1 disables test caching to guarantee fresh execution
go test $PACKAGES -v -count=1

echo "== [2/3] Validating Frontend Type Integrity, Tests & Static Export =="
(cd frontend && npm run lint)
(cd frontend && npm run test)
rm -rf frontend/.next
(cd frontend && npm run build)

echo "== [3/3] Compiling Embedded Go Executable =="
GIT_VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

go build -ldflags "-X github.com/vtrgo/flux/internal/version.Version=${GIT_VERSION} -X github.com/vtrgo/flux/internal/version.Commit=${GIT_COMMIT} -X github.com/vtrgo/flux/internal/version.BuildDate=${BUILD_DATE}" -o bin/flux cmd/flux/main.go

echo "== [Success] All tests passed. Single Executable compiled to 'bin/flux' =="
