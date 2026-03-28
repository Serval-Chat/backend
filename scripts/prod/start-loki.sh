#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "Starting chat-loki..."

docker run -d \
  --name chat-loki \
  --restart unless-stopped \
  --network "${COMPOSE_PROJECT_NAME:-backend}_app_network" \
  --memory 512m --cpus 0.5 \
  -p 127.0.0.1:3100:3100 \
  -v chat-loki_data:/loki \
  grafana/loki:2.9.0 \
  -config.file=/etc/loki/local-config.yaml

echo "chat-loki started."
