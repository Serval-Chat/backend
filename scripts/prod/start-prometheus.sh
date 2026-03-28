#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "Starting chat-prometheus..."

docker run -d \
  --name chat-prometheus \
  --restart unless-stopped \
  --network "${COMPOSE_PROJECT_NAME:-backend}_app_network" \
  --memory 512m --cpus 0.5 \
  -p 127.0.0.1:9090:9090 \
  -v "$(pwd)/docker/prometheus.production.yml:/etc/prometheus/prometheus.yml:ro" \
  -v chat-prometheus_data:/prometheus \
  prom/prometheus:v2.51.0 \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --web.console.libraries=/usr/share/prometheus/console_libraries \
  --web.console.templates=/usr/share/prometheus/consoles \
  --web.listen-address=0.0.0.0:9090

echo "chat-prometheus started."
