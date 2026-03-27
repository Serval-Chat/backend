#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping production cluster..."

docker compose -f docker/docker-compose.prod.yml -f docker/docker-compose.nginx.prod.yml down

echo "Production cluster stopped."
