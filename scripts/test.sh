#!/usr/bin/env bash
set -euo pipefail

echo "== [1/2] Running Go Backend Tests =="
go test ./... -v

echo "== [2/2] Validating Frontend Type Integrity =="
(cd frontend && npm run build)

echo "== [Success] All tests and verifications passed =="
