#!/usr/bin/env bash
set -euo pipefail

echo "== [1/2] Running Go Backend Tests & Linter =="
# Filter out unintended Go packages hidden inside Next.js node_modules
PACKAGES=$(go list ./... | grep -v /node_modules/)

echo "-> Running golangci-lint..."
go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run $PACKAGES

echo "-> Running Go Unit Tests..."
# -count=1 disables test caching to guarantee fresh execution
go test $PACKAGES -v -count=1

echo "== [2/2] Validating Frontend Type Integrity & Linter =="
(cd frontend && npm run lint)
(cd frontend && npm run build)

echo "== [Success] All tests and verifications passed =="
