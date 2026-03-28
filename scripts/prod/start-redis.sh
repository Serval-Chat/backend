#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

env_val() { grep -E "^${1}=" .env | head -1 | cut -d= -f2- || true; }
REDIS_PASSWORD=$(env_val REDIS_PASSWORD)
PROJECT=$(env_val COMPOSE_PROJECT_NAME); PROJECT=${PROJECT:-backend}

echo "Starting chat-redis..."

docker run -d \
  --name chat-redis \
  --restart unless-stopped \
  --memory 256m --cpus 0.2 \
  -p 127.0.0.1:6379:6379 \
  -v chat-redis_data:/data \
  redis:7-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065 \
  redis-server --requirepass "${REDIS_PASSWORD}" --appendonly yes

echo "chat-redis started."
