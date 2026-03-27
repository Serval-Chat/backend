#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting production cluster in background..."

export COMPOSE_PROJECT_NAME=backend
NETWORK_NAME="${COMPOSE_PROJECT_NAME}_app_network"
if ! docker network ls | grep -q "$NETWORK_NAME"; then
    echo "Creating network $NETWORK_NAME..."
    docker network create "$NETWORK_NAME"
fi

docker compose -f docker/docker-compose.prod.yml -f docker/docker-compose.nginx.prod.yml up -d

echo ""
echo "Production cluster started successfully."
echo "Use ./stop-prod-cluster.sh to stop it."
echo "Use ./restart-prod-cluster.sh to restart it."
