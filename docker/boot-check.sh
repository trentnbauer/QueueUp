#!/bin/sh
# Boots a built QueueUp image against throwaway Postgres and Redis containers and checks that it really
# works: the schema is pushed, the server reports healthy, the web app is served (compressed), the API
# refuses a call without a key, and CORS only names the app's own address. It exists because type-checks and
# unit tests passed on dependency bumps that still broke the image (see CONTRIBUTING notes in the Dockerfile).
#
#   docker build -f docker/Dockerfile.server -t queueup-check .
#   sh docker/boot-check.sh queueup-check
#
# Creates and removes its own containers and network (all named qucheck-*); never touches anything else.
# Needs Docker and curl. Exits non-zero on the first failed check and prints the server log.
set -u
IMAGE="${1:-queueup-check}"
NET=qucheck-net
PORT="${QUCHECK_PORT:-3911}"
FAILED=0

cleanup() {
  docker rm -f qucheck-app qucheck-pg qucheck-redis >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

fail() {
  echo "FAIL: $1"
  FAILED=1
}
ok() { echo "ok:   $1"; }

docker network create "$NET" >/dev/null || exit 2
docker run -d --rm --name qucheck-pg --network "$NET" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=qu postgres:18-alpine >/dev/null || exit 2
docker run -d --rm --name qucheck-redis --network "$NET" redis:8-alpine >/dev/null || exit 2

# Wait for Postgres to accept connections (it restarts once during first-time setup).
for i in $(seq 1 30); do
  docker exec qucheck-pg pg_isready -U postgres -d qu >/dev/null 2>&1 && break
  sleep 2
done
sleep 3

docker run -d --name qucheck-app --network "$NET" -p "127.0.0.1:$PORT:3000" \
  -e APP_BASE_URL="http://localhost:$PORT" \
  -e DATABASE_URL=postgresql://postgres:pw@qucheck-pg:5432/qu \
  -e REDIS_URL=redis://qucheck-redis:6379 \
  -e SESSION_SECRET=0123456789abcdef0123456789abcdef0123 \
  -e DISCORD_CLIENT_ID=x -e DISCORD_CLIENT_SECRET=y \
  -e ALLOW_INSECURE_SESSION_COOKIE=true \
  "$IMAGE" >/dev/null || exit 2

code=000
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/healthz")
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] && ok "healthz answers 200 (schema pushed, server up)" || fail "healthz answered $code"

status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

[ "$(status "http://127.0.0.1:$PORT/api/me")" = "200" ] && ok "/api/me answers when signed out" || fail "/api/me did not answer 200"
[ "$(status "http://127.0.0.1:$PORT/api/v1/library")" = "401" ] && ok "/api/v1 refuses a call with no key (401)" || fail "/api/v1/library without a key was not 401"
[ "$(status "http://127.0.0.1:$PORT/")" = "200" ] && ok "the web app is served" || fail "the web app was not served"

asset=$(curl -s "http://127.0.0.1:$PORT/" | grep -o '/assets/[^"]*\.js' | head -1)
if [ -n "$asset" ]; then
  enc=$(curl -s -H 'Accept-Encoding: br, gzip' -D - -o /dev/null "http://127.0.0.1:$PORT$asset" | tr -d '\r' | grep -i '^content-encoding:' | head -1)
  [ -n "$enc" ] && ok "assets are compressed ($enc)" || fail "the JS asset came back uncompressed"
else
  fail "found no JS asset in the page"
fi

origin=$(curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET" "http://127.0.0.1:$PORT/api/me" | tr -d '\r' | grep -i '^access-control-allow-origin:' | head -1)
case "$origin" in
  *evil.example*|'*') fail "CORS allowed a foreign origin: $origin" ;;
  *) ok "CORS does not allow a foreign origin" ;;
esac

if [ "$FAILED" != "0" ]; then
  echo "---- server log"
  docker logs qucheck-app 2>&1 | tail -60
  exit 1
fi
echo "boot check passed"
