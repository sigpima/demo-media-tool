#!/usr/bin/env bash
# Runs ON THE SERVER, next to docker-compose.yml and .env.
#   ./update.sh              pull the tag from .env (default: latest) and restart
#   ./update.sh sha-abc1234  deploy / roll back to one specific build (for this run only; edit CBT_TAG in .env to make it stick)
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "No .env here. Copy .env.example to .env and fill it in." >&2; exit 1; }
[ -z "${1:-}" ] || export CBT_TAG="$1"

echo "• pulling image (${CBT_TAG:-from .env})"
docker compose pull

echo "• restarting (running batches are dropped; invite links and settings are kept)"
docker compose up -d --remove-orphans

echo "• waiting for the app to be healthy"
for _ in $(seq 1 40); do
  status="$(docker compose ps --format '{{.Health}}' app 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
if [ "${status:-}" != "healthy" ]; then
  echo "App did not become healthy. Last logs:" >&2
  docker compose logs --tail 30 app >&2
  echo "Roll back with: ./update.sh <previous-tag>   (see: docker image ls)" >&2
  exit 1
fi

docker image prune -f >/dev/null   # remove superseded layers
docker compose ps
echo "Deployed: $(docker compose ps --format '{{.Image}}' app)"
