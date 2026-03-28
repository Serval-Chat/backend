#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

env_val() { grep -E "^${1}=" .env | head -1 | cut -d= -f2- || true; }
PROJECT=$(env_val COMPOSE_PROJECT_NAME); PROJECT=${PROJECT:-backend}
echo "Starting chat-loki..."

docker run -d \
  --name chat-loki \
  --restart unless-stopped \
  --network "${PROJECT}_app_network" \
  --memory 512m --cpus 0.5 \
  -p 127.0.0.1:3100:3100 \
  -v chat-loki_data:/loki \
  grafana/loki:2.9.0 \
  -config.file=/etc/loki/local-config.yaml

echo "chat-loki started."
