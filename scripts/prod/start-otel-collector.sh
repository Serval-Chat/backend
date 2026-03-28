#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "Starting chat-otel-collector..."

docker run -d \
  --name chat-otel-collector \
  --restart unless-stopped \
  --network "${COMPOSE_PROJECT_NAME:-backend}_app_network" \
  --memory 256m --cpus 0.5 \
  -p 127.0.0.1:4317:4317 \
  -p 127.0.0.1:4318:4318 \
  --add-host host.docker.internal:host-gateway \
  -v "$(pwd)/docker/otel-collector.yml:/etc/otel-collector.yml:ro" \
  otel/opentelemetry-collector-contrib:0.96.0 \
  --config=/etc/otel-collector.yml

echo "chat-otel-collector started."
