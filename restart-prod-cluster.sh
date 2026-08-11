#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Restarting production cluster..."

docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.nginx.prod.yml restart

echo "Production cluster restarted."
