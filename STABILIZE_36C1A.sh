#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

echo "==========================================================="
echo "CMP Patch 36C.1a - Commercial Database Stabilization"
echo "==========================================================="
echo "Production/Linux/macOS requires MIGRATION_DATABASE_URL (recommended in .env.migration)."
echo "Stop all running backend processes first."
echo

npm run stabilize:commercial
npm run db:runtime-permissions
