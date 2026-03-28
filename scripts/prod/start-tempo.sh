#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

env_val() { grep -E "^${1}=" .env | head -1 | cut -d= -f2- || true; }
PROJECT=$(env_val COMPOSE_PROJECT_NAME); PROJECT=${PROJECT:-backend}

echo "Starting chat-tempo..."

docker run -d \
  --name chat-tempo \
  --restart unless-stopped \
  --network "${PROJECT}_app_network" \
  --memory 512m --cpus 0.5 \
  -p 127.0.0.1:3200:3200 \
  -p 127.0.0.1:9411:9411 \
  -v "$(pwd)/docker/tempo.yml:/etc/tempo.yml:ro" \
  -v chat-tempo_data:/var/tempo \
  grafana/tempo:2.4.0 \
  -config.file=/etc/tempo.yml

echo "chat-tempo started."
