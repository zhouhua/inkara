#!/usr/bin/env bash
# Assemble the admin Next.js standalone bundle for ECS (`node` via run.sh).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

standalone_root="apps/admin/.next/standalone"
if [[ ! -d "$standalone_root" ]]; then
  echo "missing $standalone_root — run pnpm build:admin first" >&2
  exit 1
fi

rm -rf .deploy/admin-standalone
mkdir -p .deploy/admin-standalone/.next .deploy/admin-standalone/migrations/mysql
cp -a "$standalone_root"/. .deploy/admin-standalone/

# Monorepo builds nest server.js under apps/admin/; single-app builds put it at root.
static_dest=".deploy/admin-standalone"
if [[ -f .deploy/admin-standalone/apps/admin/server.js ]]; then
  static_dest=".deploy/admin-standalone/apps/admin"
  mkdir -p "$static_dest/.next"
fi

if [[ -d apps/admin/.next/static ]]; then
  mkdir -p "$static_dest/.next"
  cp -a apps/admin/.next/static "$static_dest/.next/static"
fi

if [[ -d apps/admin/public ]]; then
  cp -a apps/admin/public "$static_dest/public"
else
  mkdir -p "$static_dest/public"
fi

cp -a migrations/mysql/. .deploy/admin-standalone/migrations/mysql/
cp scripts/apply-mysql-migrations.mjs .deploy/admin-standalone/apply-mysql-migrations.mjs

cat >.deploy/admin-standalone/run.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f apps/admin/server.js ]]; then
  exec node apps/admin/server.js
fi
if [[ -f server.js ]]; then
  exec node server.js
fi
echo "admin standalone: server.js not found" >&2
exit 1
EOF
chmod +x .deploy/admin-standalone/run.sh

if [[ ! -e .deploy/admin-standalone/node_modules/mysql2 ]] \
  && [[ ! -e .deploy/admin-standalone/apps/admin/node_modules/mysql2 ]] \
  && [[ ! -d .deploy/admin-standalone/node_modules/.pnpm ]]; then
  echo "admin standalone bundle is missing mysql2; ECS migrations cannot run" >&2
  exit 1
fi
# Ensure root can resolve mysql2 for apply-mysql-migrations.mjs (monorepo nest).
if [[ ! -e .deploy/admin-standalone/node_modules/mysql2 ]] \
  && [[ -e .deploy/admin-standalone/apps/admin/node_modules/mysql2 ]]; then
  mkdir -p .deploy/admin-standalone/node_modules
  ln -sfn ../apps/admin/node_modules/mysql2 \
    .deploy/admin-standalone/node_modules/mysql2
fi

echo "packed .deploy/admin-standalone"
