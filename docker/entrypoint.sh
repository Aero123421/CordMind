#!/bin/sh
set -e

MAX_RETRIES=${DB_WAIT_RETRIES:-30}

while [ $MAX_RETRIES -gt 0 ]; do
  if npx prisma db push >/dev/null 2>&1; then
    echo "Database schema applied."
    break
  fi
  MAX_RETRIES=$((MAX_RETRIES-1))
  echo "Waiting for database... (${MAX_RETRIES} retries left)"
  sleep 2
 done

if [ $MAX_RETRIES -eq 0 ]; then
  echo "Database not reachable. Exiting."
  exit 1
fi

node dist/index.js
