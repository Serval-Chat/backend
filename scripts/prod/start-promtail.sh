#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

env_val() { grep -E "^${1}=" .env | head -1 | cut -d= -f2-; }
PROJECT=$(env_val COMPOSE_PROJECT_NAME); PROJECT=${PROJECT:-backend}

echo "Starting chat-promtail..."

docker run -d \
  --name chat-promtail \
  --restart unless-stopped \
  --network "${PROJECT}_app_network" \
  --memory 128m --cpus 0.2 \
  -v /var/log:/var/log:ro \
  -v "$(pwd)/docker/promtail.yml:/etc/promtail/config.yml:ro" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  grafana/promtail:2.9.0 \
  -config.file=/etc/promtail/config.yml

echo "chat-promtail started."
