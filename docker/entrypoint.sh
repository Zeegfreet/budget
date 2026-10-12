#!/bin/sh
# Applies pending migrations, then starts the API (which also serves the web).
# SKIP_MIGRATIONS=true skips them (e.g. several replicas, migrations run apart).
# Migration output goes to stderr: with the stdio MCP server
# (`node dist/mcp/stdio.js`) stdout carries only JSON-RPC.
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  node_modules/.bin/prisma migrate deploy --config prisma7.config.ts 1>&2
fi

exec "$@"
