#!/bin/sh
set -e

echo "→ Waiting for the database…"
# Apply pending migrations (retries while Postgres finishes starting).
ATTEMPTS=0
until npx prisma migrate deploy; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 20 ]; then
    echo "✗ Database not reachable after 20 attempts, giving up."
    exit 1
  fi
  echo "  …retrying migrate deploy ($ATTEMPTS)"
  sleep 3
done

echo "✓ Migrations applied. Starting PollForge."
exec "$@"
