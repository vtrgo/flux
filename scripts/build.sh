#!/usr/bin/env bash
set -euo pipefail

echo "== [1/2] Building Next.js Frontend (Static Export) =="
rm -rf frontend/.next
(cd frontend && npm run build)

echo "== [2/2] Compiling Embedded Go Executable =="
go build -o bin/flux cmd/flux/main.go

echo "== [Success] Single Executable compiled to 'bin/flux' =="
