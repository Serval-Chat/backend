#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

env_val() { grep -E "^${1}=" .env | head -1 | cut -d= -f2- || true; }
GRAFANA_ROOT_URL=$(env_val GRAFANA_ROOT_URL)
PROJECT=$(env_val COMPOSE_PROJECT_NAME); PROJECT=${PROJECT:-backend}

echo "Starting chat-grafana..."

docker run -d \
  --name chat-grafana \
  --restart unless-stopped \
  --network "${PROJECT}_app_network" \
  --memory 256m --cpus 0.5 \
  -p 127.0.0.1:3001:3000 \
  -v chat-grafana_data:/var/lib/grafana \
  -v "$(pwd)/docker/grafana/provisioning:/etc/grafana/provisioning:ro" \
  -e GF_AUTH_ANONYMOUS_ENABLED=false \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  -e GF_AUTH_DISABLE_LOGIN_FORM=false \
  -e GF_USERS_ALLOW_SIGN_UP=false \
  -e "GF_SERVER_ROOT_URL=${GRAFANA_ROOT_URL}" \
  -e GF_SERVER_ENFORCE_DOMAIN=true \
  -e GF_SECURITY_COOKIE_SECURE=true \
  -e GF_SECURITY_COOKIE_SAMESITE=strict \
  -e GF_SECURITY_STRICT_TRANSPORT_SECURITY=true \
  -e GF_SECURITY_X_CONTENT_TYPE_OPTIONS=true \
  -e GF_SECURITY_X_XSS_PROTECTION=true \
  -e GF_SNAPSHOTS_EXTERNAL_ENABLED=false \
  -e GF_FEATURE_TOGGLES_ENABLE=traceqlEditor \
  grafana/grafana:10.4.1

echo "chat-grafana started."
