#!/usr/bin/env bash
# Assemble the Next.js standalone bundle that ECS runs with `node server.js`.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -f .next/standalone/server.js ]]; then
  echo "missing .next/standalone/server.js — run pnpm build:node first" >&2
  exit 1
fi

rm -rf .deploy/standalone
mkdir -p .deploy/standalone/.next .deploy/standalone/migrations/mysql
cp -a .next/standalone/. .deploy/standalone/
cp -a .next/static .deploy/standalone/.next/static
cp -a public .deploy/standalone/public
cp -a migrations/mysql/. .deploy/standalone/migrations/mysql/
cp scripts/apply-mysql-migrations.mjs .deploy/standalone/apply-mysql-migrations.mjs

if [[ ! -d .deploy/standalone/node_modules/mysql2 ]]; then
  echo "standalone bundle is missing mysql2; ECS migrations cannot run" >&2
  exit 1
fi
