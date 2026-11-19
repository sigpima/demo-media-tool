#!/usr/bin/env bash
# Boots a built image the way production does and checks the things that must never break.
# Used by CI before an image is published; also runnable locally:  scripts/smoke_test.sh <image>
set -euo pipefail

IMAGE="${1:?usage: smoke_test.sh <image>}"
NAME="cbt-smoke-$$"
PORT="${SMOKE_PORT:-18000}"
PASSWORD="ci-smoke-password-123"
BASE="http://127.0.0.1:${PORT}"
fail() { echo "SMOKE TEST FAILED: $*" >&2; docker logs "$NAME" 2>&1 | tail -20 >&2 || true; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "• a weak password must stop the container from starting"
docker run --rm -e CBT_REQUIRE_AUTH=true -e CBT_BASIC_AUTH_USER=ci -e CBT_BASIC_AUTH_PASSWORD=short "$IMAGE" >/dev/null 2>&1 \
  && fail "container started with a weak password" || true

echo "• start the container (read-only filesystem, no capabilities, like production)"
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:8000" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -e CBT_REQUIRE_AUTH=true -e CBT_BASIC_AUTH_USER=ci -e "CBT_BASIC_AUTH_PASSWORD=${PASSWORD}" \
  -v "${NAME}-data:/data" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" || true)" = "200" ] && break
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" || true)" = "200" ] || fail "/api/health did not become ready"

echo "• access control"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" = "401" ] || fail "anonymous request to / was not refused"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/batches" -X POST)" = "401" ] || fail "anonymous API call was not refused"

echo "• the web app is bundled in the image"
curl -sf -u "ci:${PASSWORD}" "$BASE/" | grep -q 'id="root"' || fail "index.html with the React root is missing"

echo "• API answers and applies the admin limits"
curl -sf -u "ci:${PASSWORD}" "$BASE/api/config" | grep -q '"role":"admin"' || fail "/api/config did not report the admin role"

echo "• invite links work end to end"
OUT="$(docker exec "$NAME" python -m app.invites create --label smoke --base-url "$BASE")"
LINK="$(printf '%s\n' "$OUT" | grep -o "${BASE}/invite/[A-Za-z0-9_-]*")" || fail "no invite link was printed"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$LINK")" = "303" ] || fail "invite link did not redirect"
docker exec "$NAME" python -m app.invites list | grep -q smoke || fail "invite is not listed"

echo "• container runs as a non-root user"
[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "container runs as root"

docker volume rm "${NAME}-data" >/dev/null 2>&1 || true
echo "SMOKE TEST PASSED"
