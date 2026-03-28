#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source .env

echo "Starting chat-redis..."

docker run -d \
  --name chat-redis \
  --restart unless-stopped \
  --network "${COMPOSE_PROJECT_NAME:-backend}_app_network" \
  --memory 256m --cpus 0.2 \
  -v chat-redis_data:/data \
  redis:7-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065 \
  redis-server --requirepass "${REDIS_PASSWORD}" --appendonly yes

echo "chat-redis started."
