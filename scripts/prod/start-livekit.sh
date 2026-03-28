#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source .env

echo "Starting chat-livekit..."

docker run -d \
  --name chat-livekit \
  --restart unless-stopped \
  --network "${COMPOSE_PROJECT_NAME:-backend}_app_network" \
  --memory 1g --cpus 0.5 \
  -p 127.0.0.1:7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -v "$(pwd)/docker/livekit.prod.yaml:/etc/livekit.yaml:ro" \
  -e "LIVEKIT_KEYS=${LIVEKIT_API_KEY}:${LIVEKIT_API_SECRET}" \
  -e "REDIS_PASSWORD=${REDIS_PASSWORD}" \
  livekit/livekit-server:v1.8.0 \
  --config /etc/livekit.yaml

echo "chat-livekit started."
