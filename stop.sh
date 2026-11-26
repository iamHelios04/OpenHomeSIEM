#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
docker compose stop
echo 'OpenHomeSIEM is stopped. Your database and settings are preserved.'
