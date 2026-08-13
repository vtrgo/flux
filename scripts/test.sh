#!/usr/bin/env bash
set -euo pipefail

echo "== [1/2] Running Go Backend Tests & Linter =="
go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run ./...
go test ./... -v -count=1

echo "== [2/2] Validating Frontend Type Integrity & Linter =="
(cd frontend && npm run lint)
(cd frontend && npm run build)

echo "== [Success] All tests and verifications passed =="
