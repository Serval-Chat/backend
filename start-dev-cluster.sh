#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

REPLICAS=4
FULL_STACK=false

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -n|--replicas)
            REPLICAS="$2"
            shift
            ;;
        --full)
            FULL_STACK=true
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
    shift
done

PIDS=""
cleanup() {
    echo "Stopping cluster..."
    [[ -n "$PIDS" ]] && kill $PIDS 2>/dev/null || true
    if [ "$FULL_STACK" = true ]; then
        docker compose -f docker/docker-compose.dev.yml stop
        docker compose -f docker/docker-compose.dev.yml rm -f
    else
        docker compose -f docker/docker-compose.dev.yml stop nginx redis
        docker compose -f docker/docker-compose.dev.yml rm -f nginx redis
    fi
    exit 0
}
trap cleanup INT TERM

if [ ! -f docker/nginx.dev.conf.template ]; then
    echo "Error: docker/nginx.dev.conf.template not found!"
    exit 1
fi

UPSTREAM_SERVERS_FILE=$(mktemp)
for (( i=1; i<=REPLICAS; i++ )); do
    echo "        server host.docker.internal:$((4000 + i));" >> "$UPSTREAM_SERVERS_FILE"
done
sed -e "/{{UPSTREAM_SERVERS}}/r $UPSTREAM_SERVERS_FILE" -e "/{{UPSTREAM_SERVERS}}/d" \
    docker/nginx.dev.conf.template > docker/nginx.dev.conf
rm "$UPSTREAM_SERVERS_FILE"

echo "Cleaning up processes on ports 4001..$((4000 + REPLICAS))..."
for (( i=1; i<=REPLICAS; i++ )); do
    fuser -k "$((4000 + i))/tcp" 2>/dev/null || true
done

if [ "$FULL_STACK" = true ]; then
    echo "Starting full stack with docker/docker-compose.dev.yml..."
    docker compose -f docker/docker-compose.dev.yml up -d
else
    echo "Starting infrastructure (Redis, Nginx)..."
    docker compose -f docker/docker-compose.dev.yml up -d redis nginx
fi

echo "Waiting for Redis..."
until docker exec chat-redis-dev redis-cli ping 2>/dev/null | grep -q PONG; do
    sleep 0.5
done
echo "Redis ready."

echo "Starting $REPLICAS backend instances..."
for (( i=1; i<=REPLICAS; i++ )); do
    # Dev Redis is intentionally passwordless
    CHAT_PORT=$((4000 + i)) \
    INSTANCE_NAME="node-$i" \
    LOG_LEVEL=warn \
    REDIS_URL="redis://localhost:16379" \
    LOKI_HOST="http://localhost:13100" \
    OTEL_EXPORTER_OTLP_ENDPOINT="grpc://localhost:14317" \
    npm run dev > "instance$i.log" 2>&1 &
    PIDS="$PIDS $!"
done

echo ""
echo "Dev cluster started with $REPLICAS replicas."
echo "Proxy listening on http://localhost:3000"
echo "Logs: instance1.log .. instance${REPLICAS}.log"
echo "Press Ctrl+C to stop the cluster."

wait
