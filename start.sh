#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then exec sh ./install.sh; fi
build_from_source=$(sed -n 's/^BUILD_FROM_SOURCE=//p' .env | tail -n 1)
if [ "$build_from_source" = "true" ]; then
  docker compose -f docker-compose.yml -f docker-compose.source.yml up --build -d
else
  docker compose up -d
fi
web_port=$(sed -n 's/^WEB_PORT=//p' .env | tail -n 1)
[ -n "$web_port" ] || web_port=80
echo "OpenHomeSIEM: http://localhost:$web_port"
