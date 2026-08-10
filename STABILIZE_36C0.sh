#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
echo "STABILIZE_36C0.sh is deprecated. Routing to STABILIZE_36C1A.sh..."
exec ./STABILIZE_36C1A.sh
