#!/usr/bin/env bash
set -euo pipefail

: "${GITLAB_HOST:?Set GITLAB_HOST before starting the dynamic smoke loop}"
: "${GITLAB_TOKEN:?Set GITLAB_TOKEN before starting the dynamic smoke loop}"

docker compose up -d
docker compose logs --no-log-prefix install-dynamic-plugins

echo "DevPortal is running at http://localhost:7007"
echo "Stop it with: docker compose down -v"
