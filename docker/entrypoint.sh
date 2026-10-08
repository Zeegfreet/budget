#!/bin/sh
# Applies pending migrations, then starts the API (which also serves the web).
# SKIP_MIGRATIONS=true skips them (e.g. several replicas, migrations run apart).
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  node_modules/.bin/prisma migrate deploy --config prisma7.config.ts
fi

exec "$@"
