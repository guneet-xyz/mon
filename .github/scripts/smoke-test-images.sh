#!/usr/bin/env bash
# Smoke-tests one platform's website, agent, docs and migrator images together.
#
# Usage: .github/scripts/smoke-test-images.sh <amd64|arm64>
# Images (already present locally, e.g. pulled by digest) come from
# WEBSITE_IMAGE, AGENT_IMAGE, DOCS_IMAGE and MIGRATOR_IMAGE.
#
# Starts a throwaway PostgreSQL, runs the migrator against it (twice, to check
# it is idempotent), starts the website with a config that assigns one website
# tile to a throwaway agent, and waits until the agent's ping reaches the
# database through the website. Then checks that docs serves its pages.
# Everything uses generated, throwaway credentials and the host network.
set -euo pipefail

arch=${1:?usage: smoke-test-images.sh <amd64|arm64>}
: "${WEBSITE_IMAGE:?}" "${AGENT_IMAGE:?}" "${DOCS_IMAGE:?}" "${MIGRATOR_IMAGE:?}"

POSTGRES_IMAGE=postgres:18-alpine
# Below the Linux ephemeral port range (32768+), so no client socket holds them.
DB_PORT=15432
WEBSITE_PORT=13000
DOCS_PORT=13001
DATABASE_URL="postgres://mon:mon@127.0.0.1:${DB_PORT}/mon"
WEBSITE_URL="http://127.0.0.1:${WEBSITE_PORT}"
DOCS_URL="http://127.0.0.1:${DOCS_PORT}"
CONTAINERS=(mon-smoke-db mon-smoke-website mon-smoke-agent mon-smoke-docs)

config_dir=$(mktemp -d)

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    for container in "${CONTAINERS[@]}"; do
      if docker container inspect "$container" >/dev/null 2>&1; then
        echo "::group::docker logs $container"
        docker logs "$container" 2>&1 || true
        echo "::endgroup::"
      fi
    done
  fi
  docker rm --force "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  rm -rf "$config_dir"
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "::error::$*" >&2
  exit 1
}

# wait_for <description> <timeout seconds> <command...>
wait_for() {
  local description=$1 timeout=$2
  shift 2
  local deadline=$((SECONDS + timeout))
  until "$@" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      fail "timed out after ${timeout}s waiting for $description"
    fi
    sleep 2
  done
  echo "ok: $description"
}

sql() {
  docker exec mon-smoke-db psql -U mon -d mon -tAc "$1"
}

is_running() {
  [ "$(docker inspect --format '{{.State.Running}}' "$1")" = true ]
}

docker rm --force "${CONTAINERS[@]}" >/dev/null 2>&1 || true

for image in "$WEBSITE_IMAGE" "$AGENT_IMAGE" "$DOCS_IMAGE" "$MIGRATOR_IMAGE"; do
  platform=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")
  [ "$platform" = "linux/$arch" ] || fail "$image is $platform, expected linux/$arch"
  echo "ok: $image is $platform"
done

echo "--- PostgreSQL"
docker run --detach --name mon-smoke-db --network host \
  --env POSTGRES_USER=mon --env POSTGRES_PASSWORD=mon --env POSTGRES_DB=mon \
  --env PGPORT="$DB_PORT" \
  "$POSTGRES_IMAGE" -c listen_addresses=127.0.0.1 >/dev/null
# Probe over TCP: during initialisation PostgreSQL only listens on its socket.
wait_for "PostgreSQL" 60 docker exec mon-smoke-db pg_isready -h 127.0.0.1 -U mon -d mon

echo "--- migrator"
for run in 1 2; do
  docker run --rm --network host --env DATABASE_URL="$DATABASE_URL" "$MIGRATOR_IMAGE" ||
    fail "migrator run $run failed"
done
for table in mon_host_ping mon_website_ping mon_container_ping mon_github_ping mon_github_check_run; do
  [ "$(sql "SELECT to_regclass('public.$table') IS NOT NULL")" = t ] || fail "migrator did not create $table"
done
echo "ok: migrator applied the schema"

echo "--- website"
agent_id=smoke
agent_token=$(openssl rand -hex 32)
token_hash=$(printf '%s' "$agent_token" | sha256sum | cut -d' ' -f1)
cat >"$config_dir/config.toml" <<EOF
[agents.$agent_id]
token_hash = "$token_hash"

[[tiles]]
type = "website"
key = "smoke-website"
name = "Smoke website"
url = "$WEBSITE_URL/"
agent = "$agent_id"
interval_seconds = 5
EOF
chmod 755 "$config_dir"
chmod 644 "$config_dir/config.toml"

docker run --detach --name mon-smoke-website --network host \
  --env NODE_ENV=production \
  --env DATABASE_URL="$DATABASE_URL" \
  --env CONFIG_PATH=/etc/mon/config.toml \
  --env HOSTNAME=127.0.0.1 \
  --env PORT="$WEBSITE_PORT" \
  --volume "$config_dir:/etc/mon:ro" \
  "$WEBSITE_IMAGE" >/dev/null
wait_for "website serves /" 90 curl --fail --silent --show-error "$WEBSITE_URL/"

status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$WEBSITE_URL/api/agent/jobs")
[ "$status" = 401 ] || fail "unauthenticated /api/agent/jobs returned $status, expected 401"
jobs=$(curl --fail --silent --show-error \
  --header "Authorization: Bearer $agent_token" --header "X-Agent-Id: $agent_id" \
  "$WEBSITE_URL/api/agent/jobs")
grep -q '"smoke-website"' <<<"$jobs" || fail "/api/agent/jobs did not assign the smoke tile: $jobs"
echo "ok: website agent API authenticates and assigns jobs"

echo "--- agent"
docker run --detach --name mon-smoke-agent --network host \
  --env NODE_ENV=production \
  --env WEBSITE_URL="$WEBSITE_URL" \
  --env AGENT_ID="$agent_id" \
  --env AGENT_TOKEN="$agent_token" \
  --env AGENT_POLL_INTERVAL_SECONDS=5 \
  "$AGENT_IMAGE" >/dev/null
ping_recorded() {
  [ "$(sql "SELECT count(*) FROM mon_website_ping WHERE key = 'smoke-website' AND agent_id = '$agent_id' AND error IS NULL")" -gt 0 ]
}
wait_for "successful agent ping stored through the website" 90 ping_recorded
is_running mon-smoke-agent || fail "agent exited"
echo "ok: agent is still running"

echo "--- docs"
docker run --detach --name mon-smoke-docs --network host \
  --env NODE_ENV=production \
  --env HOSTNAME=127.0.0.1 \
  --env PORT="$DOCS_PORT" \
  "$DOCS_IMAGE" >/dev/null
wait_for "docs serves /" 90 curl --fail --silent --show-error "$DOCS_URL/"
curl --fail --silent --show-error --output /dev/null "$DOCS_URL/docs/configuration" ||
  fail "docs did not serve /docs/configuration"
echo "ok: docs serves its pages"

echo "All $arch smoke tests passed."
