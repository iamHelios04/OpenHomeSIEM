#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

source_build_arg=false
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 1 ] || [ "$1" != "--source-build" ]; then
    echo 'Usage: sh ./install.sh [--source-build]' >&2
    exit 2
  fi
  source_build_arg=true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is not installed. Install Docker Desktop (macOS/Windows) or Docker Engine with the Compose plugin (Linux), then run this script again.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose is not available. Update Docker Desktop or install the Docker Compose plugin, then try again.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is installed but not running. Start Docker Desktop or the Docker service, then try again.' >&2
  exit 1
fi

if [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    secret_key=$(openssl rand -hex 32)
  elif command -v od >/dev/null 2>&1; then
    secret_key=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  else
    echo 'A secure random-key generator (openssl or od) is required for first-time setup.' >&2
    exit 1
  fi
  env_tmp=".env.tmp.$$"
  awk -v secret_key="$secret_key" '/^SECRET_KEY=/ { print "SECRET_KEY=" secret_key; next } { print }' .env.example > "$env_tmp"
  mv "$env_tmp" .env
  chmod 600 .env 2>/dev/null || true
  echo 'Created a local .env file with a random secret key.'
fi

if [ "$source_build_arg" = true ]; then
  env_tmp=".env.tmp.$$"
  if grep -q '^BUILD_FROM_SOURCE=' .env; then
    sed 's/^BUILD_FROM_SOURCE=.*/BUILD_FROM_SOURCE=true/' .env > "$env_tmp"
  else
    cat .env > "$env_tmp"
    printf '\nBUILD_FROM_SOURCE=true\n' >> "$env_tmp"
  fi
  mv "$env_tmp" .env
fi

build_from_source=$(sed -n 's/^BUILD_FROM_SOURCE=//p' .env | tail -n 1)
if [ "$build_from_source" = "true" ]; then
  compose() {
    docker compose -f docker-compose.yml -f docker-compose.source.yml "$@"
  }
else
  compose() {
    docker compose "$@"
  }
fi

mkdir -p data

if ! compose config --quiet; then
  echo 'Docker Compose configuration is invalid. Check your .env file.' >&2
  exit 1
fi
if [ "$build_from_source" = "true" ]; then
  if ! compose up --build -d; then
    echo 'Startup failed. If a port is busy, change WEB_PORT, SYSLOG_UDP_PORT, or SYSLOG_TCP_PORT in .env.' >&2
    exit 1
  fi
else
  if ! compose pull; then
    echo 'Could not pull the published images. Check your internet connection and GHCR_OWNER/IMAGE_TAG in .env.' >&2
    exit 1
  fi
  if ! compose up -d; then
    echo 'Startup failed. If a port is busy, change WEB_PORT, SYSLOG_UDP_PORT, or SYSLOG_TCP_PORT in .env.' >&2
    exit 1
  fi
fi

attempt=0
healthy=0
while [ "$attempt" -lt 45 ]; do
  if compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  compose ps
  echo 'The API did not become healthy. Run: docker compose logs --tail=100' >&2
  exit 1
fi

env_value() {
  value=$(sed -n "s/^$1=//p" .env | tail -n 1)
  if [ -n "$value" ]; then printf '%s' "$value"; else printf '%s' "$2"; fi
}
web_port=$(env_value WEB_PORT 8080)
udp_port=$(env_value SYSLOG_UDP_PORT 5514)
tcp_port=$(env_value SYSLOG_TCP_PORT 6601)
attempt=0
frontend_ready=0
while [ "$attempt" -lt 15 ]; do
  if compose exec -T frontend wget -q --spider http://127.0.0.1/ >/dev/null 2>&1; then
    frontend_ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$frontend_ready" -ne 1 ]; then
  compose ps
  echo 'The API is healthy but the dashboard container did not respond. Run: docker compose logs --tail=100 frontend' >&2
  exit 1
fi
echo
echo 'OpenHomeSIEM is installed and running.'
echo "Dashboard:  http://localhost:$web_port"
echo "API health: http://localhost:$web_port/api/health"
echo "Router syslog: UDP port $udp_port (recommended) or TCP port $tcp_port"
echo 'Next: configure the router to send syslog to this computer’s LAN IP, then allow that UDP port through the computer firewall.'
